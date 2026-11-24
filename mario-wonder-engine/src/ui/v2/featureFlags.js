/**
 * Feature Flags for UI v2 Rollout (`src/ui/v2/featureFlags.js`)
 * ==============================================================
 * Flip `UI_FLAGS.v2` to `false` (or append `?ui=v1` to URL) to restore the
 * legacy v1 interface immediately with zero gameplay impact.
 */

const STORAGE_KEY = 'prism_stride_ui_v2_flag';

export const UI_FLAGS = {
  v2: true,
};

export function resolveUiV2Enabled() {
  if (typeof window === 'undefined') {
    return UI_FLAGS.v2;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const qp = params.get('ui');
    if (qp === 'v1' || qp === '0' || qp === 'false') return false;
    if (qp === 'v2' || qp === '1' || qp === 'true') return true;
    const saved = window.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'false') return false;
    if (saved === 'true') return true;
  } catch {
    // Ignore storage/URL access errors
  }
  return UI_FLAGS.v2;
}

export function persistUiV2Enabled(enabled) {
  UI_FLAGS.v2 = Boolean(enabled);
  if (typeof window === 'undefined') return UI_FLAGS.v2;
  try {
    window.localStorage?.setItem(STORAGE_KEY, UI_FLAGS.v2 ? 'true' : 'false');
  } catch {
    // Ignore storage quota errors
  }
  return UI_FLAGS.v2;
}

export function resolveInitialGalleryOpen() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('gallery') === '1' || params.get('gallery') === 'true';
  } catch {
    return false;
  }
}

export function resolveInitialSafeOverlay() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('safeoverlay') === '1' || params.get('safeoverlay') === 'true';
  } catch {
    return false;
  }
}

export default UI_FLAGS;
