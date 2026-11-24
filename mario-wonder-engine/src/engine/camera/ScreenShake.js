/**
 * ScreenShake — Unified Trauma-Based Camera Shake & Perturbation API (Stages 4 & 7)
 * =================================================================================
 * Model:
 *   shake = trauma^2
 *   offsetX/Y = shake * maxOffset * noise(t) + directional impulse bias
 *   rollDeg (angleDeg) = shake * maxAngleDeg * noise(t)
 *   pitchDeg = shake * maxPitchDeg * noise(t) + vertical impact bias
 *
 * Ground Pound impact adds 0.65 trauma; decays linearly to 0 over 0.40s.
 * Presentation-only: never mutates physics or collision hitboxes.
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import { clamp } from '../../utils/MathUtils.js';

class ScreenShake {
  constructor() {
    this.trauma = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.angleDeg = 0;
    this.rollDeg = 0;
    this.pitchDeg = 0;
    this._dirX = 0;
    this._dirY = 0;
    this._time = 0;
  }

  /**
   * Add trauma [0..1] with optional directional impact vector (dirX, dirY).
   * @param {number} amount
   * @param {number} [dirX=0]
   * @param {number} [dirY=0]
   */
  addTrauma(amount, dirX = 0, dirY = 0) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
    if (Number.isFinite(dirX)) this._dirX = clamp(dirX, -1, 1);
    if (Number.isFinite(dirY)) this._dirY = clamp(dirY, -1, 1);
    this._sample();
  }

  update(dt) {
    if (this.trauma <= 0) {
      this.reset();
      return;
    }

    const refTrauma = Math.max(0.05, MovementProfile.groundPound.screenTrauma);
    const decayTime = Math.max(0.05, MovementProfile.groundPound.traumaDecay);
    const decayRate = refTrauma / decayTime;

    this.trauma = Math.max(0, this.trauma - decayRate * dt);
    this._time += dt;

    if (this.trauma <= 1e-6) {
      this.reset();
      return;
    }

    this._sample();
  }

  _sample() {
    const shake = this.trauma * this.trauma;
    const maxOffset = MovementProfile.groundPound.traumaMaxOffset;
    const maxAngle = MovementProfile.groundPound.traumaMaxAngleDeg;
    const maxPitch = maxAngle * 0.85;

    const nx = this._noise(this._time * 41.0, 0.7);
    const ny = this._noise(this._time * 47.0, 19.3);
    const nRoll = this._noise(this._time * 33.0, 51.1);
    const nPitch = this._noise(this._time * 37.0, 83.7);

    const dirDecay = Math.exp(-this._time * 12.0);
    const biasX = this._dirX * 0.22 * dirDecay * Math.cos(this._time * 45.0);
    const biasY = this._dirY * 0.28 * dirDecay * Math.cos(this._time * 45.0);

    this.offsetX = shake * maxOffset * (nx + biasX);
    this.offsetY = shake * maxOffset * (ny + biasY);
    this.angleDeg = shake * maxAngle * nRoll;
    this.rollDeg = this.angleDeg;
    this.pitchDeg = shake * maxPitch * (nPitch + biasY);
  }

  _noise(t, seed) {
    return (
      0.55 * Math.sin(t + seed) +
      0.30 * Math.cos(t * 1.73 + seed * 2.1) +
      0.15 * Math.sin(t * 2.89 - seed)
    );
  }

  reset() {
    this.trauma = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.angleDeg = 0;
    this.rollDeg = 0;
    this.pitchDeg = 0;
    this._dirX = 0;
    this._dirY = 0;
    this._time = 0;
  }
}

export default ScreenShake;
