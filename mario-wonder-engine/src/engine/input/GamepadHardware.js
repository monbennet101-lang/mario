/**
 * GamepadHardware — Dynamic Hardware Detection, Vendor Profiling & Hotplug
 * =========================================================================
 * Identifies Sony DualShock 4 / DualSense controllers via Vendor/Product IDs
 * and broad regex heuristics, provides universal W3C "standard" fallback,
 * supports 1-click manual UI layout override (Auto | Force PS4 | Force Xbox),
 * handles dynamic hotplug + active-pad auto-switching, and dispatches
 * diegetic connection toasts.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

export const ControllerProfile = {
  KEYBOARD: 'KEYBOARD',
  DUALSHOCK4: 'DUALSHOCK4',
  XBOX: 'XBOX',
  GENERIC: 'GENERIC',
};

export const LayoutOverride = {
  AUTO: 'AUTO',
  FORCE_PS4: 'FORCE_PS4',
  FORCE_XBOX: 'FORCE_XBOX',
};

const SONY_VENDOR_ID = '054c';

const SONY_PRODUCT_NAMES = {
  '05c4': 'DualShock 4 Wireless Controller (v1)',
  '09cc': 'DualShock 4 Wireless Controller (v2)',
  '0ce6': 'DualSense Wireless Controller',
  '0df2': 'DualSense Edge Controller',
};

const SONY_REGEX = /(054c|sony|dualshock|dualsense|playstation|ps4|ps5|wireless controller)/i;
const XBOX_REGEX = /(045e|xbox|xinput|microsoft)/i;
const STORAGE_KEY = 'prism_stride_gamepad_layout_override';

/**
 * Extract normalized 4-hex-digit vendor/product IDs from standard Chrome/Firefox/Safari gamepad.id strings.
 * Handles formats like:
 *   "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
 *   "054c-05c4-Sony Computer Entertainment Wireless Controller"
 *   "Sony Interactive Entertainment DualSense (054c:0ce6)"
 */
export function parseVendorProductIds(idStr = '') {
  const raw = String(idStr || '');
  let vendorId = null;
  let productId = null;

  const explicitVendor = raw.match(/vendor[:\s]+0?x?([0-9a-f]{4})/i);
  const explicitProduct = raw.match(/product[:\s]+0?x?([0-9a-f]{4})/i);
  if (explicitVendor) vendorId = explicitVendor[1].toLowerCase();
  if (explicitProduct) productId = explicitProduct[1].toLowerCase();

  if (!vendorId || !productId) {
    const pairMatch = raw.match(/\b([0-9a-f]{4})[-:]([0-9a-f]{4})\b/i);
    if (pairMatch) {
      if (!vendorId) vendorId = pairMatch[1].toLowerCase();
      if (!productId) productId = pairMatch[2].toLowerCase();
    }
  }

  return { vendorId, productId };
}

/**
 * Produce a clean human-readable controller name from a Gamepad object.
 */
function cleanControllerDisplayName(rawId, vendorId, productId, isSony) {
  if (vendorId === SONY_VENDOR_ID && productId && SONY_PRODUCT_NAMES[productId]) {
    return SONY_PRODUCT_NAMES[productId];
  }
  if (isSony && /dualsense\s*edge/i.test(rawId)) return 'DualSense Edge Controller';
  if (isSony && /dualsense|ps5/i.test(rawId)) return 'DualSense Wireless Controller';
  if (isSony && /dualshock|ps4|wireless controller/i.test(rawId)) return 'DualShock 4 Wireless Controller';

  // Strip verbose Chrome "(STANDARD GAMEPAD Vendor: ...)" suffix
  const stripped = String(rawId || '')
    .replace(/\s*\([^)]*(?:vendor|standard gamepad|xinput)[^)]*\)\s*/gi, '')
    .replace(/^[0-9a-f]{4}[-:][0-9a-f]{4}[-:\s]*/i, '')
    .trim();

  if (stripped.length > 0) return stripped;
  return isSony ? 'PlayStation Controller' : 'Standard Gamepad';
}

/**
 * Inspect a browser Gamepad object and determine its hardware vendor profile.
 */
export function identifyGamepad(gamepad) {
  if (!gamepad) return null;
  const rawId = String(gamepad.id || '');
  const { vendorId, productId } = parseVendorProductIds(rawId);

  const isSonyVendor = vendorId === SONY_VENDOR_ID;
  const isKnownSonyProduct = Boolean(productId && SONY_PRODUCT_NAMES[productId]);
  const isSony = isSonyVendor || isKnownSonyProduct || SONY_REGEX.test(rawId);
  const isXbox = !isSony && XBOX_REGEX.test(rawId);
  const isStandard = gamepad.mapping === 'standard' || !gamepad.mapping;

  let profile = ControllerProfile.GENERIC;
  if (isSony) {
    profile = ControllerProfile.DUALSHOCK4;
  } else if (isXbox) {
    profile = ControllerProfile.XBOX;
  }

  const displayName = cleanControllerDisplayName(rawId, vendorId, productId, isSony);

  return {
    index: gamepad.index ?? 0,
    profile,
    displayName,
    vendorId,
    productId,
    isSony,
    isXbox,
    isStandard,
    rawId,
    hasVibration: Boolean(
      gamepad.vibrationActuator && typeof gamepad.vibrationActuator.playEffect === 'function'
    ),
  };
}

/**
 * Check if a gamepad currently has any active button press or stick deflection
 * beyond the radial inner deadzone (used for active-pad auto-switching).
 */
export function isGamepadActuated(gamepad) {
  if (!gamepad || gamepad.connected === false) return false;
  const buttons = gamepad.buttons || [];
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    if (!b) continue;
    if (b.pressed || (typeof b.value === 'number' && b.value > 0.35)) {
      return true;
    }
  }
  const axes = gamepad.axes || [];
  const dz = MovementProfile.input.radialInnerDeadzone;
  const ax0 = axes[0] || 0;
  const ax1 = axes[1] || 0;
  if (Math.sqrt(ax0 * ax0 + ax1 * ax1) > dz + 0.08) {
    return true;
  }
  return false;
}

class GamepadHardwareManager {
  constructor() {
    this._connectedPads = new Map(); // index -> info
    this._activePadIndex = null;
    this._layoutOverride = this._loadSavedOverride();
    this._virtualGamepadProvider = null;
    this._toastListeners = new Set();
    this._changeListeners = new Set();
    this._lastToast = null;

    this._boundOnConnected = this._onGamepadConnected.bind(this);
    this._boundOnDisconnected = this._onGamepadDisconnected.bind(this);
  }

  _loadSavedOverride() {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(STORAGE_KEY);
        if (val && Object.values(LayoutOverride).includes(val)) {
          return val;
        }
      }
    } catch {
      // Ignore storage errors in restricted iframes / headless mode
    }
    return LayoutOverride.AUTO;
  }

  _saveOverride(val) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, val);
      }
    } catch {
      // Ignore storage errors
    }
  }

  init() {
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', this._boundOnConnected);
    window.addEventListener('gamepaddisconnected', this._boundOnDisconnected);
    this.scanConnectedGamepads(false);
  }

  destroy() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('gamepadconnected', this._boundOnConnected);
    window.removeEventListener('gamepaddisconnected', this._boundOnDisconnected);
  }

  /**
   * Inject a virtual gamepad provider (for headless tests & Playwright simulation).
   * Pass `null` to restore browser `navigator.getGamepads()`.
   */
  setVirtualGamepadProvider(providerFn) {
    this._virtualGamepadProvider = typeof providerFn === 'function' ? providerFn : null;
    this.scanConnectedGamepads(false);
    this._notifyChange();
  }

  /**
   * Retrieve the live array of raw browser or virtual Gamepad objects.
   */
  getRawGamepads() {
    if (this._virtualGamepadProvider) {
      const res = this._virtualGamepadProvider();
      return Array.isArray(res) ? res : res ? [res] : [];
    }
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        return Array.from(navigator.getGamepads() || []);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Register listener for diegetic connection toast events.
   */
  onToast(listener) {
    this._toastListeners.add(listener);
    return () => this._toastListeners.delete(listener);
  }

  /**
   * Register listener for profile/connection state changes.
   */
  onChange(listener) {
    this._changeListeners.add(listener);
    return () => this._changeListeners.delete(listener);
  }

  _emitToast(message, profile, type = 'connected') {
    const payload = {
      id: Date.now() + Math.random(),
      message,
      profile,
      type,
      timestamp: Date.now(),
    };
    this._lastToast = payload;
    for (const fn of this._toastListeners) {
      try {
        fn(payload);
      } catch {
        // Never let UI callback throw inside input polling
      }
    }
  }

  _notifyChange() {
    const summary = this.getStatus();
    for (const fn of this._changeListeners) {
      try {
        fn(summary);
      } catch {
        // Ignore listener errors
      }
    }
  }

  _formatLayoutName(profile) {
    if (profile === ControllerProfile.DUALSHOCK4) return 'PlayStation Layout Active';
    if (profile === ControllerProfile.XBOX) return 'Xbox Layout Active';
    return 'Standard Gamepad Layout Active';
  }

  _onGamepadConnected(event) {
    const gp = event?.gamepad;
    if (!gp) return;
    const info = identifyGamepad(gp);
    if (!info) return;

    this._connectedPads.set(info.index, info);
    this._activePadIndex = info.index;

    const effective = this.effectiveProfile;
    this._emitToast(
      `🎮 ${info.displayName} Connected — ${this._formatLayoutName(effective)}`,
      effective,
      'connected'
    );
    this._notifyChange();
  }

  _onGamepadDisconnected(event) {
    const gp = event?.gamepad;
    const idx = gp?.index;
    const prev = idx !== undefined ? this._connectedPads.get(idx) : null;
    if (idx !== undefined) {
      this._connectedPads.delete(idx);
    }

    if (this._activePadIndex === idx) {
      // Seamless fallback to another connected pad or keyboard
      const nextEntry = this._connectedPads.values().next().value;
      this._activePadIndex = nextEntry ? nextEntry.index : null;
    }

    if (prev) {
      this._emitToast(
        `🎮 ${prev.displayName} Disconnected — ${this._activePadIndex !== null ? 'Switched Active Pad' : 'Keyboard Fallback Active'}`,
        this.effectiveProfile,
        'disconnected'
      );
    }
    this._notifyChange();
  }

  /**
   * Poll all connected gamepads, synchronize hotplug list, handle mid-frame disconnects,
   * and perform Active Pad Auto-Switching (most recently actuated controller claims control).
   * Returns the active raw Gamepad object (or null for keyboard fallback).
   */
  pollActiveGamepad() {
    const rawList = this.getRawGamepads();
    const seenIndices = new Set();
    let activeRaw = null;
    let changed = false;

    for (let i = 0; i < rawList.length; i++) {
      const gp = rawList[i];
      if (!gp || gp.connected === false) continue;
      const idx = gp.index ?? i;
      seenIndices.add(idx);

      if (!this._connectedPads.has(idx)) {
        const info = identifyGamepad(gp);
        this._connectedPads.set(idx, info);
        if (this._activePadIndex === null) {
          this._activePadIndex = idx;
        }
        changed = true;
      }

      // Active Pad Auto-Switching: pressing any button/stick claims active control
      if (idx !== this._activePadIndex && isGamepadActuated(gp)) {
        this._activePadIndex = idx;
        changed = true;
      }

      if (idx === this._activePadIndex) {
        activeRaw = gp;
      }
    }

    // Detect silent mid-frame disconnects without waiting for event
    for (const knownIdx of Array.from(this._connectedPads.keys())) {
      if (!seenIndices.has(knownIdx)) {
        this._connectedPads.delete(knownIdx);
        changed = true;
        if (this._activePadIndex === knownIdx) {
          const fallback = this._connectedPads.values().next().value;
          this._activePadIndex = fallback ? fallback.index : null;
          activeRaw = null;
        }
      }
    }

    // If activePadIndex was cleared or missing, select first available connected pad
    if (!activeRaw && this._connectedPads.size > 0) {
      for (let i = 0; i < rawList.length; i++) {
        const gp = rawList[i];
        if (gp && gp.connected !== false) {
          this._activePadIndex = gp.index ?? i;
          activeRaw = gp;
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      this._notifyChange();
    }

    return activeRaw;
  }

  /**
   * Scan connected gamepads immediately (e.g. on init or virtual pad attach).
   */
  scanConnectedGamepads(emitToast = false) {
    const rawList = this.getRawGamepads();
    this._connectedPads.clear();
    let firstIdx = null;
    for (let i = 0; i < rawList.length; i++) {
      const gp = rawList[i];
      if (!gp || gp.connected === false) continue;
      const info = identifyGamepad(gp);
      this._connectedPads.set(info.index, info);
      if (firstIdx === null) firstIdx = info.index;
    }
    if (this._activePadIndex === null || !this._connectedPads.has(this._activePadIndex)) {
      this._activePadIndex = firstIdx;
    }
    if (emitToast && this._activePadIndex !== null) {
      const active = this._connectedPads.get(this._activePadIndex);
      if (active) {
        this._emitToast(
          `🎮 ${active.displayName} Connected — ${this._formatLayoutName(this.effectiveProfile)}`,
          this.effectiveProfile,
          'connected'
        );
      }
    }
    this._notifyChange();
  }

  /**
   * Programmatically simulate a hotplug connection (also triggers toast).
   */
  simulateConnect(gamepad) {
    this._onGamepadConnected({ gamepad });
  }

  /**
   * Programmatically simulate a hotplug disconnection.
   */
  simulateDisconnect(gamepad) {
    this._onGamepadDisconnected({ gamepad });
  }

  /**
   * Manual 1-click UI layout override: AUTO | FORCE_PS4 | FORCE_XBOX.
   */
  setLayoutOverride(mode) {
    if (!Object.values(LayoutOverride).includes(mode)) return this._layoutOverride;
    if (this._layoutOverride === mode) return mode;
    this._layoutOverride = mode;
    this._saveOverride(mode);
    const effective = this.effectiveProfile;
    const label =
      mode === LayoutOverride.FORCE_PS4
        ? 'Force PlayStation (PS4)'
        : mode === LayoutOverride.FORCE_XBOX
          ? 'Force Xbox'
          : 'Auto-Detect';
    this._emitToast(`🎮 Controller Layout: ${label}`, effective, 'layout');
    this._notifyChange();
    return mode;
  }

  get layoutOverride() {
    return this._layoutOverride;
  }

  get activePadInfo() {
    if (this._activePadIndex === null) return null;
    return this._connectedPads.get(this._activePadIndex) || null;
  }

  get isConnected() {
    return this._connectedPads.size > 0;
  }

  /**
   * Effective glyph/mapping profile resolving manual override over auto-detected hardware.
   */
  get effectiveProfile() {
    if (this._layoutOverride === LayoutOverride.FORCE_PS4) {
      return ControllerProfile.DUALSHOCK4;
    }
    if (this._layoutOverride === LayoutOverride.FORCE_XBOX) {
      return ControllerProfile.XBOX;
    }
    const active = this.activePadInfo;
    if (!active) return ControllerProfile.KEYBOARD;
    return active.profile;
  }

  get lastToast() {
    return this._lastToast;
  }

  getStatus() {
    const active = this.activePadInfo;
    return {
      connected: this.isConnected,
      connectedCount: this._connectedPads.size,
      activePadIndex: this._activePadIndex,
      activePadName: active?.displayName || 'Keyboard',
      detectedProfile: active?.profile || ControllerProfile.KEYBOARD,
      effectiveProfile: this.effectiveProfile,
      layoutOverride: this._layoutOverride,
      vendorId: active?.vendorId || null,
      productId: active?.productId || null,
      hasVibration: Boolean(active?.hasVibration),
      isPlayStation: this.effectiveProfile === ControllerProfile.DUALSHOCK4,
    };
  }
}

export default GamepadHardwareManager;
