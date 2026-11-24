/**
 * GamepadMenuNavigator — Commercial-Grade Controller UI & Menu Navigation
 * ========================================================================
 * Enables full DualShock 4 / standard gamepad control over every menu, modal,
 * segmented control, tab bar, and lifecycle screen in Prism Stride:
 *   - D-Pad / Left Stick : Spatial 2D focus navigation (with repeat delay)
 *   - Cross (✕ / Btn 0)  : Confirm / Click focused control
 *   - Circle (○ / Btn 1) : Back / Close active modal or drawer
 *   - L1 / R1 (Btn 4/5)  : Cycle tabs inside tabbed menus (DevMenu, HotkeyLegend, etc.)
 *   - Options (Btn 9)    : Toggle Pause Menu (or close open modal first)
 *   - R3 (Btn 11)        : Toggle Command Drawer (Rooms / Sim / Tools)
 *
 * Exports pure `findNextSpatialTarget()` for deterministic headless unit testing.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

const FOCUS_CLASS = 'mwe-gamepad-focus';

/**
 * Pure 2D spatial nearest-neighbor selector across candidate rectangles.
 * Finds the best element in the requested direction ('up' | 'down' | 'left' | 'right').
 * Wraps cleanly if no candidate exists strictly in that direction.
 *
 * @param {Array<{ id: any, rect: { left: number, top: number, width: number, height: number } }>} items
 * @param {number} currentIndex
 * @param {'up'|'down'|'left'|'right'} direction
 * @returns {number} Next index in `items`
 */
export function findNextSpatialTarget(items, currentIndex, direction) {
  if (!Array.isArray(items) || items.length === 0) return -1;
  if (items.length === 1) return 0;
  if (currentIndex < 0 || currentIndex >= items.length) return 0;

  const cur = items[currentIndex].rect;
  const cx = cur.left + cur.width * 0.5;
  const cy = cur.top + cur.height * 0.5;

  let bestIdx = -1;
  let bestScore = Infinity;

  for (let i = 0; i < items.length; i++) {
    if (i === currentIndex) continue;
    const r = items[i].rect;
    const tx = r.left + r.width * 0.5;
    const ty = r.top + r.height * 0.5;
    const dx = tx - cx;
    const dy = ty - cy;

    let primary = 0;
    let cross = 0;
    if (direction === 'right') {
      if (dx <= 4) continue;
      primary = dx;
      cross = Math.abs(dy);
    } else if (direction === 'left') {
      if (dx >= -4) continue;
      primary = -dx;
      cross = Math.abs(dy);
    } else if (direction === 'down') {
      if (dy <= 4) continue;
      primary = dy;
      cross = Math.abs(dx);
    } else if (direction === 'up') {
      if (dy >= -4) continue;
      primary = -dy;
      cross = Math.abs(dx);
    } else {
      continue;
    }

    // Strongly favor aligned candidates in the same row/column while keeping diagonals reachable
    const score = primary + cross * 2.4;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  if (bestIdx !== -1) return bestIdx;

  // Clean sequential wrap fallback when at an edge
  if (direction === 'down' || direction === 'right') {
    return (currentIndex + 1) % items.length;
  }
  return (currentIndex - 1 + items.length) % items.length;
}

class GamepadMenuNavigator {
  constructor() {
    this._focusedEl = null;
    this._prevButtons = {};
    this._dirHeld = null;
    this._dirFrames = 0;
    this._activeScopeEl = null;
    this._onBack = null;
    this._onToggleMenu = null;
    this._onOptions = null;
    this._onPlayMoveSound = null;
    this._onPlayConfirmSound = null;
  }

  configure({ onBack, onToggleMenu, onOptions, onPlayMoveSound, onPlayConfirmSound } = {}) {
    if (onBack !== undefined) this._onBack = onBack;
    if (onToggleMenu !== undefined) this._onToggleMenu = onToggleMenu;
    if (onOptions !== undefined) this._onOptions = onOptions;
    if (onPlayMoveSound !== undefined) this._onPlayMoveSound = onPlayMoveSound;
    if (onPlayConfirmSound !== undefined) this._onPlayConfirmSound = onPlayConfirmSound;
  }

  clearFocus() {
    if (this._focusedEl && this._focusedEl.classList) {
      this._focusedEl.classList.remove(FOCUS_CLASS);
    }
    this._focusedEl = null;
    this._activeScopeEl = null;
  }

  /**
   * Resolve the topmost active interactive UI scope (modal > drawer > lifecycle screen).
   * Returns `null` when pure gameplay is active with no menus open.
   */
  getActiveScopeElement() {
    if (typeof document === 'undefined') return null;

    // Priority 1: Open modal dialogs (HotkeyLegend, Verify, EnemyGallery, LevelAudit)
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (let i = dialogs.length - 1; i >= 0; i--) {
      const el = dialogs[i];
      if (this._isVisible(el)) return el;
    }

    // Priority 2: Expanded DevCommandMenu drawer
    const drawer = document.querySelector('[data-testid="dev-command-menu"]');
    if (drawer && this._isVisible(drawer)) return drawer;

    // Priority 3: Lifecycle & UI v2 overlays (Title, Map, Shop, Gallery, Intro, Pause, Game Over, Results)
    const lifecycleSelectors = [
      '[data-testid^="ui-v2-screen-"]',
      '[data-testid="lifecycle-pause-menu"]',
      '[data-testid="lifecycle-title-screen"]',
      '[data-testid="lifecycle-level-intro"]',
      '[data-testid="lifecycle-stage-clear"]',
      '[data-testid="lifecycle-game-over"]',
    ];
    for (let i = 0; i < lifecycleSelectors.length; i++) {
      const el = document.querySelector(lifecycleSelectors[i]);
      if (el && this._isVisible(el)) return el;
    }

    return null;
  }

  _isVisible(el) {
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0);
  }

  _getFocusableElements(scope) {
    if (!scope) return [];
    const selector = 'button:not(:disabled), [role="tab"]:not(:disabled), select:not(:disabled), input:not(:disabled)';
    const nodes = Array.from(scope.querySelectorAll(selector));
    return nodes.filter((el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      return this._isVisible(el);
    });
  }

  _applyFocus(el) {
    if (this._focusedEl === el) return;
    if (this._focusedEl && this._focusedEl.classList) {
      this._focusedEl.classList.remove(FOCUS_CLASS);
    }
    this._focusedEl = el || null;
    if (this._focusedEl && this._focusedEl.classList) {
      this._focusedEl.classList.add(FOCUS_CLASS);
      try {
        this._focusedEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        // Ignore scrollIntoView errors in minimal environments
      }
    }
  }

  _cycleTabs(scope, delta) {
    const tabs = Array.from(scope.querySelectorAll('[role="tab"]:not(:disabled)')).filter((el) =>
      this._isVisible(el)
    );
    if (tabs.length < 2) return false;
    let activeIdx = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    if (activeIdx < 0) activeIdx = 0;
    const nextIdx = (activeIdx + delta + tabs.length) % tabs.length;
    tabs[nextIdx].click();
    this._onPlayMoveSound?.();
    // Refresh focus onto first non-tab control or the newly selected tab on next frame
    this._applyFocus(tabs[nextIdx]);
    return true;
  }

  /**
   * Poll raw gamepad UI controls once per tick/frame.
   * Returns `true` when an interactive menu/overlay is active and consuming controller inputs.
   */
  poll(inputManager) {
    if (!inputManager) return false;
    const analog = inputManager.getAnalogState();
    const fb = analog.faceButtons;
    const dpad = analog.dpad;

    const edge = (name, nowPressed) => {
      const prev = Boolean(this._prevButtons[name]);
      this._prevButtons[name] = Boolean(nowPressed);
      return Boolean(nowPressed) && !prev;
    };

    const crossPressed = edge('cross', fb.cross);
    const circlePressed = edge('circle', fb.circle);
    const l1Pressed = edge('l1', fb.l1);
    const r1Pressed = edge('r1', fb.r1);
    const optionsPressed = edge('options', fb.options);
    const r3Pressed = edge('r3', fb.r3);

    // Global controller UI toggles (work in both gameplay and menu scopes)
    if (r3Pressed && this._onToggleMenu) {
      this._onToggleMenu();
      this._onPlayConfirmSound?.();
    }
    if (optionsPressed && this._onOptions) {
      this._onOptions();
      this._onPlayConfirmSound?.();
    }

    const scope = this.getActiveScopeElement();
    if (!scope) {
      if (this._focusedEl) this.clearFocus();
      this._dirHeld = null;
      this._dirFrames = 0;
      return false;
    }

    const focusables = this._getFocusableElements(scope);

    // Scope changed or focused element disappeared -> highlight primary action or first button
    if (scope !== this._activeScopeEl || !this._focusedEl || !focusables.includes(this._focusedEl)) {
      this._activeScopeEl = scope;
      const preferred =
        scope.querySelector('[data-testid="btn-start-world1"], [data-testid="btn-resume"], [data-testid="btn-begin-stage"], [data-testid="btn-next-stage"], [data-testid="btn-play-again"], [data-testid="btn-retry-world1"], [data-testid="btn-map-enter"], [data-testid="btn-shop-confirm"]') ||
        focusables[0] ||
        null;
      this._applyFocus(preferred);
    }

    // L1 / R1 switches tabs in tabbed modals / drawers
    if (l1Pressed) {
      this._cycleTabs(scope, -1);
    } else if (r1Pressed) {
      this._cycleTabs(scope, +1);
    }

    // Discrete directional input from D-Pad or Left Stick
    const stickThresh = MovementProfile.input.menuStickThreshold;
    let dir = null;
    if (dpad.up || analog.filteredY < -stickThresh) dir = 'up';
    else if (dpad.down || analog.filteredY > stickThresh) dir = 'down';
    else if (dpad.left || analog.filteredX < -stickThresh) dir = 'left';
    else if (dpad.right || analog.filteredX > stickThresh) dir = 'right';

    const repeatDelay = MovementProfile.input.menuNavRepeatDelayFrames;
    const repeatInterval = MovementProfile.input.menuNavRepeatIntervalFrames;
    let shouldStep = false;

    if (dir) {
      if (dir !== this._dirHeld) {
        this._dirHeld = dir;
        this._dirFrames = 0;
        shouldStep = true;
      } else {
        this._dirFrames++;
        if (
          this._dirFrames === repeatDelay ||
          (this._dirFrames > repeatDelay && (this._dirFrames - repeatDelay) % repeatInterval === 0)
        ) {
          shouldStep = true;
        }
      }
    } else {
      this._dirHeld = null;
      this._dirFrames = 0;
    }

    if (shouldStep && focusables.length > 0) {
      const items = focusables.map((el, idx) => ({ id: idx, rect: el.getBoundingClientRect() }));
      const curIdx = focusables.indexOf(this._focusedEl);
      const nextIdx = findNextSpatialTarget(items, curIdx, dir);
      if (nextIdx >= 0 && focusables[nextIdx]) {
        this._applyFocus(focusables[nextIdx]);
        this._onPlayMoveSound?.();
      }
    }

    // Cross (✕) confirms / activates currently focused control
    if (crossPressed && this._focusedEl && !this._focusedEl.disabled) {
      this._onPlayConfirmSound?.();
      this._focusedEl.click();
      // Guard gameplay from immediately jumping when closing a menu with Cross
      inputManager.armPostUIJumpGuard?.();
    }

    // Circle (○) acts as Back / Close
    if (circlePressed) {
      this._onPlayConfirmSound?.();
      if (this._onBack) {
        this._onBack();
      } else {
        const closeBtn = scope.querySelector('[aria-label*="Close"], [data-testid="btn-resume"]');
        closeBtn?.click();
      }
      inputManager.armPostUIJumpGuard?.();
    }

    return true;
  }
}

export default GamepadMenuNavigator;
