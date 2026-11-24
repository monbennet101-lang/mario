/**
 * MovingPlatform — Deterministic Fixed-Step Platform Entity
 * ==========================================================
 * Updates strictly on the fixed 60 Hz simulation clock before
 * character physics ticks, exporting exact per-tick displacement
 * deltas (deltaX, deltaY) and velocity vectors (vel.x, vel.y)
 * so riders stay locked to the platform and inherit momentum on jump.
 */

import Entity from './Entity.js';

class MovingPlatform extends Entity {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {number} opts.startX
   * @param {number} opts.startY
   * @param {number} [opts.endX]
   * @param {number} [opts.endY]
   * @param {number} [opts.width=3.0]
   * @param {number} [opts.height=0.5]
   * @param {number} [opts.periodSec=4.0] — Full round-trip cycle duration (seconds)
   * @param {number} [opts.phase=0.0] — Initial cycle phase [0, 1)
   * @param {'linear'|'sine'} [opts.mode='linear']
   * @param {boolean} [opts.oneWay=true]
   */
  constructor({
    id,
    startX,
    startY,
    endX = startX,
    endY = startY,
    width = 3.0,
    height = 0.5,
    periodSec = 4.0,
    phase = 0.0,
    mode = 'linear',
    oneWay = true,
  }) {
    super(startX, startY, width, height);
    this.id = id;
    this.type = 'movingPlatform';
    this.startX = startX;
    this.startY = startY;
    this.endX = endX;
    this.endY = endY;
    this.periodSec = Math.max(0.25, periodSec);
    this.phase = phase;
    this.mode = mode;
    this.oneWay = oneWay;

    this.elapsed = 0;
    this.prevPos = { x: startX, y: startY };
    this.deltaX = 0;
    this.deltaY = 0;
    this._syncPositionAt(0);
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
  }

  _evalFactor(elapsedSec) {
    const cycle = ((elapsedSec / this.periodSec) + this.phase) % 1;
    const norm = cycle < 0 ? cycle + 1 : cycle;
    if (this.mode === 'sine') {
      return 0.5 - 0.5 * Math.cos(norm * Math.PI * 2);
    }
    // Triangle ping-pong [0 -> 1 -> 0] for constant-velocity horizontal/vertical carry
    return norm <= 0.5 ? norm * 2 : 2 - norm * 2;
  }

  _syncPositionAt(elapsedSec) {
    const t = this._evalFactor(elapsedSec);
    this.pos.x = this.startX + (this.endX - this.startX) * t;
    this.pos.y = this.startY + (this.endY - this.startY) * t;
  }

  update(dt) {
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    this.elapsed += dt;
    this._syncPositionAt(this.elapsed);

    this.deltaX = this.pos.x - this.prevPos.x;
    this.deltaY = this.pos.y - this.prevPos.y;
    this.vel.x = dt > 0 ? this.deltaX / dt : 0;
    this.vel.y = dt > 0 ? this.deltaY / dt : 0;
  }

  reset() {
    this.elapsed = 0;
    this._syncPositionAt(0);
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    this.deltaX = 0;
    this.deltaY = 0;
    this.vel.x = 0;
    this.vel.y = 0;
  }

  getRenderPos(alpha) {
    return {
      x: this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha,
      y: this.prevPos.y + (this.pos.y - this.prevPos.y) * alpha,
    };
  }
}

export default MovingPlatform;
