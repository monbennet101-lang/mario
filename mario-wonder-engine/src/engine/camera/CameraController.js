/**
 * CameraController — Unified Entrypoint for Dynamic Platformer Camera Kinematics
 * ==============================================================================
 * Delegates directly to the Dynamic Platformer Camera Kinematics Engine in
 * `src/render/camera.js` so all engine, renderer, UI, and test consumers share
 * a single source of truth.
 */

export {
  PlatformerCamera,
  PlatformerCamera as default,
  computeTargetLookAheadPx,
  computeEffectiveCameraBounds,
  applyCanvasCameraTransform,
} from '../../render/camera.js';
