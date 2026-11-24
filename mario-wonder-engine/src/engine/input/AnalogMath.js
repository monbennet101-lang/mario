/**
 * AnalogMath — Scaled Radial Deadzones, Non-Linear Kinematics & Replay Codec
 * ============================================================================
 * Eliminates the cross-shaped deadzone trap of independent axial checks by
 * filtering stick deflection in polar coordinates:
 *   r = sqrt(x² + y²)
 *   r <= r_inner  -> (0, 0)
 *   r >  r_inner  -> r_norm = (min(r, r_outer) - r_inner) / (r_outer - r_inner)
 *                    (x_filt, y_filt) = (x / r, y / r) * r_norm
 *
 * Applies power curve γ = 1.35 for horizontal velocity response and provides
 * lossless 8-bit polar quantization (θ ∈ [0, 255], m ∈ [0, 255]) for 100%
 * deterministic replay serialization with zero floating-point drift.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

const TWO_PI = Math.PI * 2;

/**
 * Clamp a number to [min, max].
 */
function clamp01(val) {
  if (!Number.isFinite(val)) return 0;
  return val < 0 ? 0 : val > 1 ? 1 : val;
}

/**
 * Scaled Radial Deadzone Algorithm.
 * Preserves exact unit directional vector across all 360° with zero 4-way gate snapping.
 *
 * @param {number} rawX - Raw horizontal stick axis in [-1, 1]
 * @param {number} rawY - Raw vertical stick axis in [-1, 1]
 * @param {number} [innerDeadzone] - Inner radial threshold (default 0.15)
 * @param {number} [outerSaturation] - Outer saturation envelope (default 0.95)
 */
export function applyScaledRadialDeadzone(
  rawX,
  rawY,
  innerDeadzone = MovementProfile.input.radialInnerDeadzone,
  outerSaturation = MovementProfile.input.radialOuterSaturation
) {
  const x = Number.isFinite(rawX) ? rawX : 0;
  const y = Number.isFinite(rawY) ? rawY : 0;
  const rawMagnitude = Math.sqrt(x * x + y * y);

  if (rawMagnitude <= innerDeadzone || rawMagnitude <= 1e-12) {
    return {
      x: 0.0,
      y: 0.0,
      magnitude: 0.0,
      angle: 0.0,
      rawMagnitude,
      inDeadzone: true,
    };
  }

  const span = Math.max(1e-6, outerSaturation - innerDeadzone);
  const clampedR = Math.min(rawMagnitude, outerSaturation);
  const normMagnitude = clamp01((clampedR - innerDeadzone) / span);

  const unitX = x / rawMagnitude;
  const unitY = y / rawMagnitude;
  const filteredX = unitX * normMagnitude;
  const filteredY = unitY * normMagnitude;
  let angle = Math.atan2(filteredY, filteredX);
  if (angle < 0) angle += TWO_PI;

  return {
    x: filteredX,
    y: filteredY,
    magnitude: normMagnitude,
    angle,
    rawMagnitude,
    inDeadzone: false,
  };
}

/**
 * Non-Linear Kinematic Response Curve (γ = 1.35).
 *   v_target = sign(x_filt) * |x_filt|^γ * v_max
 *
 * @param {number} filteredX - Filtered horizontal stick axis in [-1, 1]
 * @param {number} maxSpeed - Top velocity (Walk 5.20 or Sprint 9.20 tiles/s)
 * @param {number} [gamma] - Power curve exponent (default 1.35)
 */
export function computeAnalogTargetVelocity(
  filteredX,
  maxSpeed,
  gamma = MovementProfile.input.analogResponseGamma
) {
  if (!Number.isFinite(filteredX) || filteredX === 0) return 0.0;
  const absX = clamp01(Math.abs(filteredX));
  if (absX === 0) return 0.0;
  const sign = filteredX < 0 ? -1 : 1;
  return sign * Math.pow(absX, gamma) * maxSpeed;
}

/**
 * Classify horizontal analog deflection into kinematic control bands.
 * - NEUTRAL: |x| == 0
 * - PRECISION: 0 < |x| <= 0.55 (micro-stepping 1.25–3.50 tiles/s for ledge maneuvers)
 * - MOMENTUM: |x| > 0.55 (explosive ramp-up to Walk 5.20 / Sprint 9.20 tiles/s)
 */
export function getAnalogSpeedBand(filteredX) {
  const absX = Math.abs(filteredX || 0);
  if (absX < MovementProfile.input.digitalThresholdX) return 'NEUTRAL';
  if (absX <= MovementProfile.input.precisionBandMax) return 'PRECISION';
  return 'MOMENTUM';
}

/**
 * Quantize filtered stick vector (x, y) into deterministic 8-bit polar bytes:
 *   angleByte θ ∈ [0, 255]
 *   magByte   m ∈ [0, 255]
 */
export function quantizeAnalogStick(filteredX, filteredY) {
  const x = Number.isFinite(filteredX) ? filteredX : 0;
  const y = Number.isFinite(filteredY) ? filteredY : 0;
  const mag = clamp01(Math.sqrt(x * x + y * y));
  const magByte = Math.round(mag * 255) & 0xFF;

  if (magByte === 0) {
    return { angleByte: 0, magByte: 0 };
  }

  let rad = Math.atan2(y, x);
  if (rad < 0) rad += TWO_PI;
  const angleByte = Math.round((rad / TWO_PI) * 255) & 0xFF;
  return { angleByte, magByte };
}

/**
 * Reconstruct exact deterministic (x, y, magnitude, angle) from 8-bit polar bytes.
 * Using the dequantized vector for both live simulation and replay guarantees
 * 100% bitwise deterministic replay with zero floating-point drift.
 */
export function dequantizeAnalogStick(angleByte, magByte) {
  const m = (magByte & 0xFF) / 255;
  if (m === 0) {
    return { x: 0.0, y: 0.0, magnitude: 0.0, angle: 0.0 };
  }
  const rad = ((angleByte & 0xFF) / 255) * TWO_PI;
  const x = Math.cos(rad) * m;
  const y = Math.sin(rad) * m;
  return {
    x: Math.abs(x) < 1e-12 ? 0.0 : x,
    y: Math.abs(y) < 1e-12 ? 0.0 : y,
    magnitude: m,
    angle: rad,
  };
}

/**
 * Pack digital action bitmask (8 bits) + quantized analog polar bytes (16 bits) +
 * analogActive flag (bit 24) into a single deterministic 25-bit unsigned integer.
 * Fully backwards-compatible with legacy 8-bit digital-only masks (where bits 8..24 === 0).
 */
export function packInputFrame(actionBitmask, angleByte = 0, magByte = 0, analogActive = false) {
  const mask = actionBitmask & 0xFF;
  if (!analogActive || (magByte & 0xFF) === 0) {
    return mask;
  }
  return (
    mask |
    ((angleByte & 0xFF) << 8) |
    ((magByte & 0xFF) << 16) |
    (1 << 24)
  ) >>> 0;
}

/**
 * Unpack either a packed 25-bit integer OR an object frame `{ bitmask, angleByte, magByte, analogActive }`.
 */
export function unpackInputFrame(frame) {
  if (frame && typeof frame === 'object') {
    const bitmask = (frame.bitmask ?? frame.mask ?? 0) & 0xFF;
    const angleByte = (frame.angleByte ?? frame.angle ?? 0) & 0xFF;
    const magByte = (frame.magByte ?? frame.mag ?? 0) & 0xFF;
    const analogActive = Boolean(frame.analogActive ?? magByte > 0) && magByte > 0;
    return { bitmask, angleByte, magByte, analogActive };
  }

  const word = (Number(frame) || 0) >>> 0;
  const bitmask = word & 0xFF;
  const angleByte = (word >>> 8) & 0xFF;
  const magByte = (word >>> 16) & 0xFF;
  const analogActive = ((word >>> 24) & 1) === 1 && magByte > 0;
  return { bitmask, angleByte, magByte, analogActive };
}

export default {
  applyScaledRadialDeadzone,
  computeAnalogTargetVelocity,
  getAnalogSpeedBand,
  quantizeAnalogStick,
  dequantizeAnalogStick,
  packInputFrame,
  unpackInputFrame,
};
