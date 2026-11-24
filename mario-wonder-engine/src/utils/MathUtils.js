/**
 * MathUtils — Common math helpers for the engine.
 */

/**
 * Linear interpolation.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp value between min and max.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Move a value toward a target by a maximum step.
 */
export function moveToward(current, target, maxStep) {
  if (Math.abs(target - current) <= maxStep) return target;
  return current + Math.sign(target - current) * maxStep;
}

/**
 * Smooth damp (critically damped spring).
 * Returns [newValue, newVelocity].
 */
export function smoothDamp(current, target, velocity, smoothTime, dt) {
  const omega = 2.0 / smoothTime;
  const x = omega * dt;
  const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  const newVel = (velocity - omega * temp) * exp;
  return [target + (change + temp) * exp, newVel];
}

/**
 * Sign function that returns 0 for 0.
 */
export function sign(x) {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}

/**
 * Convert degrees to radians.
 */
export function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees.
 */
export function radToDeg(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Simple 32-bit hash of a string (FNV-1a).
 */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) | 0;
  }
  return h >>> 0;
}
