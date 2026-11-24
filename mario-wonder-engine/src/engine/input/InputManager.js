/**
 * InputManager — Keyboard & Native DualShock 4 / Standard Gamepad Input Layer
 * ============================================================================
 * Exposes: held, pressedThisFrame, releasedThisFrame, framesHeld
 * Plus native DualShock 4 / DualSense pipeline:
 *   - Scaled radial deadzone (r_inner = 0.15, r_outer = 0.95)
 *   - Non-linear velocity curve (γ = 1.35) via AnalogMath
 *   - Thumb-roll face button ergonomics (Square Run + Cross Jump, Circle Spin, Triangle Up)
 *   - Analog trigger pressure thresholds (L2 > 0.35 Down/Ground Pound, R2 > 0.25 Run/Sprint)
 *   - 0-frame debounce D-Pad OR analog stick symbiosis
 *   - System ergonomics (Options Pause, Touchpad Telemetry [F3], L3 Reset Room)
 *   - Asymmetric dual-motor HapticsManager integration
 *   - Deterministic quantized polar replay serialization (v2, backwards-compatible with v1)
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import {
  applyScaledRadialDeadzone,
  quantizeAnalogStick,
  dequantizeAnalogStick,
  packInputFrame,
  unpackInputFrame,
} from './AnalogMath.js';
import GamepadHardwareManager, {
  ControllerProfile,
  LayoutOverride,
} from './GamepadHardware.js';
import HapticsManager from './HapticsManager.js';

export { ControllerProfile, LayoutOverride };

export const Actions = {
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down',
  JUMP: 'jump',
  RUN: 'run',
  SPIN: 'spin',
  PAUSE: 'pause',
};

const ACTION_LIST = Object.values(Actions);

const DEFAULT_KEY_MAP = {
  ArrowLeft: Actions.LEFT,
  ArrowRight: Actions.RIGHT,
  ArrowUp: Actions.UP,
  ArrowDown: Actions.DOWN,
  a: Actions.LEFT,
  d: Actions.RIGHT,
  w: Actions.UP,
  s: Actions.DOWN,
  z: Actions.JUMP,
  j: Actions.JUMP,
  x: Actions.RUN,
  k: Actions.RUN,
  e: Actions.SPIN,
  l: Actions.SPIN,
};

/**
 * DualShock 4 / W3C Standard Gamepad button indices.
 */
export const DualShockButton = {
  CROSS: 0,      // ✕ — Jump (Primary thumb anchor)
  CIRCLE: 1,     // ○ — Spin / Flutter / Air Stall (Menu Back)
  SQUARE: 2,     // □ — Run / Dash / Carry / Throw (Thumb-roll with Cross)
  TRIANGLE: 3,   // △ — Up / Look Up / Enter Pipe
  L1: 4,         // L1 — Dedicated bumper Spin (Menu Prev Tab)
  R1: 5,         // R1 — Dedicated bumper Spin (Menu Next Tab)
  L2: 6,         // L2 — Analog Trigger (> 0.35 -> Down / Crouch / Ground Pound)
  R2: 7,         // R2 — Analog Trigger (> 0.25 -> Run / Sprint)
  SHARE: 8,      // Share / Select — Telemetry HUD fallback
  OPTIONS: 9,    // Options — Pause
  L3: 10,        // L3 — Left Stick Click (Reset Room / Quick Respawn)
  R3: 11,        // R3 — Right Stick Click (Toggle Command Menu Drawer)
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  PS_HOME: 16,
  TOUCHPAD: 17,  // DualShock 4 Touchpad Click — Toggle Telemetry HUD [F3]
};

/**
 * Read analog trigger value safely from a GamepadButton (or fallback axis).
 */
function readButtonPressure(gp, btnIndex) {
  const btn = gp?.buttons?.[btnIndex];
  if (!btn) return 0;
  if (typeof btn.value === 'number' && Number.isFinite(btn.value)) {
    return Math.max(0, Math.min(1, btn.value));
  }
  return btn.pressed ? 1 : 0;
}

function isButtonPressed(gp, btnIndex) {
  const btn = gp?.buttons?.[btnIndex];
  if (!btn) return false;
  return Boolean(btn.pressed || (typeof btn.value === 'number' && btn.value > 0.5));
}

class InputManager {
  constructor() {
    this._keyMap = { ...DEFAULT_KEY_MAP };
    this._state = {};
    this._prevState = {};
    this._framesHeld = {};
    this._rawKeys = new Set();
    this._latchedActions = new Set();
    this._injectedPresses = {};

    for (const action of ACTION_LIST) {
      this._state[action] = false;
      this._prevState[action] = false;
      this._framesHeld[action] = 0;
      this._injectedPresses[action] = false;
    }

    // Hardware detection, vendor profiling & dual-motor haptics
    this.hardware = new GamepadHardwareManager();
    this.haptics = new HapticsManager(this.hardware);

    // Live analog & button telemetry (read by PlayerController, InputVisualizer, TelemetryHUD, MenuNavigator)
    this._analogState = {
      rawX: 0,
      rawY: 0,
      filteredX: 0,
      filteredY: 0,
      magnitude: 0,
      angle: 0,
      angleByte: 0,
      magByte: 0,
      inDeadzone: true,
      analogActive: false,
      analogHorizontal: false,
      l2Pressure: 0,
      r2Pressure: 0,
      dpad: { up: false, down: false, left: false, right: false },
      faceButtons: {
        cross: false,
        circle: false,
        square: false,
        triangle: false,
        l1: false,
        r1: false,
        l2: false,
        r2: false,
        l3: false,
        r3: false,
        options: false,
        touchpad: false,
      },
    };

    // Edge tracking for gamepad system buttons (Touchpad, L3, Options)
    this._prevSystemButtons = {
      touchpad: false,
      l3: false,
      options: false,
    };

    // UI navigation lock (suppresses gameplay jump/run while controller navigates menus)
    this.uiNavigationActive = false;
    this._requireJumpReleaseAfterUI = false;

    // Recording / Replay (v2 supports quantized analog polar bytes)
    this._recording = null;
    this._recordingMeta = null;
    this._isRecording = false;
    this._replay = null;
    this._replayFrame = 0;
    this._isReplaying = false;

    // Debug hotkeys (not part of gameplay simulation input)
    this._debugCallbacks = {};

    this._boundKeyDown = this._onKeyDown.bind(this);
    this._boundKeyUp = this._onKeyUp.bind(this);
    this._boundBlur = this.clearInputs.bind(this);
    this._boundVisibility = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.clearInputs();
      }
    };
  }

  init() {
    this.hardware.init();
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', this._boundKeyDown);
    window.addEventListener('keyup', this._boundKeyUp);
    window.addEventListener('blur', this._boundBlur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._boundVisibility);
    }
  }

  destroy() {
    this.hardware.destroy();
    this.haptics.destroy();
    if (typeof window === 'undefined') return;
    window.removeEventListener('keydown', this._boundKeyDown);
    window.removeEventListener('keyup', this._boundKeyUp);
    window.removeEventListener('blur', this._boundBlur);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._boundVisibility);
    }
  }

  /**
   * Release all held keys and analog state (prevents stuck keys on window blur/tab switch).
   */
  clearInputs() {
    this._rawKeys.clear();
    this._latchedActions.clear();
    for (const action of ACTION_LIST) {
      this._state[action] = false;
      this._prevState[action] = false;
      this._framesHeld[action] = 0;
      this._injectedPresses[action] = false;
    }
    this._resetAnalogState();
  }

  _resetAnalogState() {
    const a = this._analogState;
    a.rawX = 0;
    a.rawY = 0;
    a.filteredX = 0;
    a.filteredY = 0;
    a.magnitude = 0;
    a.angle = 0;
    a.angleByte = 0;
    a.magByte = 0;
    a.inDeadzone = true;
    a.analogActive = false;
    a.analogHorizontal = false;
    a.l2Pressure = 0;
    a.r2Pressure = 0;
    a.dpad.up = false;
    a.dpad.down = false;
    a.dpad.left = false;
    a.dpad.right = false;
    for (const k of Object.keys(a.faceButtons)) {
      a.faceButtons[k] = false;
    }
  }

  /**
   * Prevent the Cross button used to confirm a menu button from firing a gameplay jump
   * on the very first frame after closing the menu.
   */
  armPostUIJumpGuard() {
    this._requireJumpReleaseAfterUI = true;
  }

  /**
   * Register a debug hotkey callback (not recorded/replayed).
   */
  registerDebugKey(key, callback) {
    this._debugCallbacks[key.toLowerCase()] = callback;
  }

  _triggerDebugKey(key) {
    const cb = this._debugCallbacks[String(key).toLowerCase()];
    if (cb) cb();
  }

  _normalizeKey(rawKey) {
    return rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
  }

  _onKeyDown(e) {
    const key = this._normalizeKey(e.key);

    // Let native shortcuts pass through (e.g. Ctrl+R, Cmd+Shift+I)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Allow typing numbers/text inside live tuning inputs (lil-gui text boxes)
    const targetTag = e.target?.tagName;
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || e.target?.isContentEditable) {
      if (key === 'Escape') {
        e.target.blur?.();
      }
      return;
    }

    // Debug hotkeys (e.g., F3, 1-5, Space, ., t, g, h, i, u)
    const debugCb = this._debugCallbacks[key.toLowerCase()];
    if (debugCb) {
      e.preventDefault();
      if (!e.repeat) {
        debugCb();
      }
      return;
    }

    if (key === 'Escape' || key === 'p') {
      if (this._debugCallbacks['escape'] && key === 'Escape') {
        e.preventDefault();
        if (!e.repeat) this._debugCallbacks['escape']();
        return;
      }
      if (this._debugCallbacks['p'] && key === 'p') {
        e.preventDefault();
        if (!e.repeat) this._debugCallbacks['p']();
        return;
      }
    }

    const action = this._keyMap[key];
    if (action) {
      e.preventDefault();
      this._rawKeys.add(key);
      if (!e.repeat) {
        this._latchedActions.add(action);
      }
    }
  }

  _onKeyUp(e) {
    const key = this._normalizeKey(e.key);
    this._rawKeys.delete(key);
  }

  /**
   * Poll raw gamepad hardware & update analog/face-button state without touching gameplay actions.
   * Used when the game loop is paused so GamepadMenuNavigator can still drive menus smoothly.
   */
  pollGamepadHardwareOnly() {
    const gp = this.hardware.pollActiveGamepad();
    if (!gp) {
      this._resetAnalogState();
      return null;
    }
    this._sampleGamepadToAnalogState(gp);
    return gp;
  }

  /**
   * Poll — called once per fixed 60 Hz simulation tick.
   * Reads keyboard + DualShock 4 / standard gamepad (or replay frame), updates state/prevState/framesHeld.
   */
  poll() {
    if (this._isReplaying && this._replay) {
      this._applyReplayFrame();
      return;
    }

    for (const action of ACTION_LIST) {
      this._prevState[action] = this._state[action];
      this._state[action] = false;
    }

    // Keyboard held keys
    let digitalHorizKey = false;
    for (const key of this._rawKeys) {
      const action = this._keyMap[key];
      if (action) {
        this._state[action] = true;
        if (action === Actions.LEFT || action === Actions.RIGHT) digitalHorizKey = true;
      }
    }

    // Latched single-frame taps pressed between ticks
    for (const action of this._latchedActions) {
      this._state[action] = true;
      if (action === Actions.LEFT || action === Actions.RIGHT) digitalHorizKey = true;
    }
    this._latchedActions.clear();

    // Gamepad (browser or virtual provider)
    this._pollGamepad(digitalHorizKey);

    // Suppress gameplay actions when controller is actively driving a menu/modal
    if (this.uiNavigationActive) {
      for (const action of ACTION_LIST) {
        if (action !== Actions.PAUSE) {
          this._state[action] = false;
        }
      }
      this._analogState.analogHorizontal = false;
    }

    // Post-UI jump guard: wait until Cross is released once after confirming a menu button
    if (this._requireJumpReleaseAfterUI) {
      if (this._analogState.faceButtons.cross) {
        this._state[Actions.JUMP] = false;
      } else {
        this._requireJumpReleaseAfterUI = false;
      }
    }

    // Update framesHeld
    for (const action of ACTION_LIST) {
      if (this._state[action]) {
        this._framesHeld[action]++;
      } else {
        this._framesHeld[action] = 0;
      }
    }

    // Record frame if recording
    if (this._isRecording) {
      this._recordFrame();
    }
  }

  _sampleGamepadToAnalogState(gp) {
    const inputCfg = MovementProfile.input;
    const rawX = Number.isFinite(gp.axes?.[0]) ? gp.axes[0] : 0;
    const rawY = Number.isFinite(gp.axes?.[1]) ? gp.axes[1] : 0;

    // 1. Scaled Radial Deadzone (r_inner = 0.15, r_outer = 0.95)
    const radial = applyScaledRadialDeadzone(
      rawX,
      rawY,
      inputCfg.radialInnerDeadzone,
      inputCfg.radialOuterSaturation
    );

    // 2. Deterministic 8-bit polar quantization so live play and replay match bitwise
    const { angleByte, magByte } = quantizeAnalogStick(radial.x, radial.y);
    const deq = dequantizeAnalogStick(angleByte, magByte);

    const l2Pressure = readButtonPressure(gp, DualShockButton.L2);
    const r2Pressure = readButtonPressure(gp, DualShockButton.R2);

    const dpadUp = isButtonPressed(gp, DualShockButton.DPAD_UP);
    const dpadDown = isButtonPressed(gp, DualShockButton.DPAD_DOWN);
    const dpadLeft = isButtonPressed(gp, DualShockButton.DPAD_LEFT);
    const dpadRight = isButtonPressed(gp, DualShockButton.DPAD_RIGHT);

    const cross = isButtonPressed(gp, DualShockButton.CROSS);
    const circle = isButtonPressed(gp, DualShockButton.CIRCLE);
    const square = isButtonPressed(gp, DualShockButton.SQUARE);
    const triangle = isButtonPressed(gp, DualShockButton.TRIANGLE);
    const l1 = isButtonPressed(gp, DualShockButton.L1);
    const r1 = isButtonPressed(gp, DualShockButton.R1);
    const l2 = l2Pressure > inputCfg.l2DownThreshold;
    const r2 = r2Pressure > inputCfg.r2RunThreshold;
    const l3 = isButtonPressed(gp, DualShockButton.L3);
    const r3 = isButtonPressed(gp, DualShockButton.R3);
    const options = isButtonPressed(gp, DualShockButton.OPTIONS);
    const touchpad =
      isButtonPressed(gp, DualShockButton.TOUCHPAD) ||
      isButtonPressed(gp, DualShockButton.SHARE);

    const a = this._analogState;
    a.rawX = rawX;
    a.rawY = rawY;
    a.filteredX = deq.x;
    a.filteredY = deq.y;
    a.magnitude = deq.magnitude;
    a.angle = deq.angle;
    a.angleByte = angleByte;
    a.magByte = magByte;
    a.inDeadzone = radial.inDeadzone;
    a.analogActive = !radial.inDeadzone && magByte > 0;
    a.l2Pressure = l2Pressure;
    a.r2Pressure = r2Pressure;
    a.dpad.up = dpadUp;
    a.dpad.down = dpadDown;
    a.dpad.left = dpadLeft;
    a.dpad.right = dpadRight;

    const fb = a.faceButtons;
    fb.cross = cross;
    fb.circle = circle;
    fb.square = square;
    fb.triangle = triangle;
    fb.l1 = l1;
    fb.r1 = r1;
    fb.l2 = l2;
    fb.r2 = r2;
    fb.l3 = l3;
    fb.r3 = r3;
    fb.options = options;
    fb.touchpad = touchpad;

    return a;
  }

  _pollGamepad(digitalHorizKey = false) {
    const gp = this.hardware.pollActiveGamepad();
    if (!gp) {
      this._resetAnalogState();
      this._prevSystemButtons.touchpad = false;
      this._prevSystemButtons.l3 = false;
      this._prevSystemButtons.options = false;
      return;
    }

    const inputCfg = MovementProfile.input;
    const a = this._sampleGamepadToAnalogState(gp);
    const fb = a.faceButtons;
    const dpad = a.dpad;

    // 1. Classic Thumb-Roll Face Button Ergonomics
    if (fb.cross) this._state[Actions.JUMP] = true;      // ✕ -> Jump
    if (fb.square) this._state[Actions.RUN] = true;      // □ -> Run / Dash / Carry / Throw
    if (fb.circle) this._state[Actions.SPIN] = true;     // ○ -> Spin / Flutter / Air Stall
    if (fb.triangle) this._state[Actions.UP] = true;     // △ -> Up / Look Up / Enter Pipe

    // 2. Shoulder Bumpers & Analog Trigger Suite
    if (fb.l1 || fb.r1) this._state[Actions.SPIN] = true; // L1 / R1 -> Dedicated bumper Spin
    if (fb.r2) this._state[Actions.RUN] = true;           // R2 > 0.25 -> Index-finger Sprint
    if (fb.l2) this._state[Actions.DOWN] = true;          // L2 > 0.35 -> Trigger Crouch / Ground Pound

    // 3. D-Pad (0-frame debounce) OR Scaled Radial Analog Stick Symbiosis
    const stickLeft = a.filteredX < -inputCfg.digitalThresholdX;
    const stickRight = a.filteredX > inputCfg.digitalThresholdX;
    const stickUp = a.filteredY < -inputCfg.digitalThresholdY;
    const stickDown = a.filteredY > inputCfg.digitalThresholdY;

    if (dpad.left || stickLeft) this._state[Actions.LEFT] = true;
    if (dpad.right || stickRight) this._state[Actions.RIGHT] = true;
    if (dpad.up || stickUp) this._state[Actions.UP] = true;
    if (dpad.down || stickDown) this._state[Actions.DOWN] = true;

    // Analog horizontal curve applies only when stick drives horizontal direction (not digital D-Pad/keyboard)
    const digitalHoriz = digitalHorizKey || dpad.left || dpad.right;
    a.analogHorizontal = !digitalHoriz && (stickLeft || stickRight);

    // 4. System & Debug Ergonomics (rising-edge triggered)
    if (fb.options) this._state[Actions.PAUSE] = true;

    const touchpadEdge = fb.touchpad && !this._prevSystemButtons.touchpad;
    const l3Edge = fb.l3 && !this._prevSystemButtons.l3;
    this._prevSystemButtons.touchpad = fb.touchpad;
    this._prevSystemButtons.l3 = fb.l3;
    this._prevSystemButtons.options = fb.options;

    if (touchpadEdge) {
      this._triggerDebugKey('f3');
    }
    if (l3Edge && !this.uiNavigationActive) {
      this._triggerDebugKey('r');
    }
  }

  /**
   * Direct single-frame gamepad state injection helper for deterministic headless tests.
   */
  pollFromGamepadObject(gamepad) {
    this.hardware.setVirtualGamepadProvider(() => (gamepad ? [gamepad] : []));
    this.poll();
  }

  // ─── Accessors ────────────────────────────────────────────

  held(action) {
    return this._state[action] === true;
  }

  pressedThisFrame(action) {
    return (this._state[action] && !this._prevState[action]) || this._injectedPresses[action] === true;
  }

  releasedThisFrame(action) {
    return !this._state[action] && this._prevState[action];
  }

  framesHeld(action) {
    return this._framesHeld[action] || 0;
  }

  /**
   * True when horizontal velocity should use the γ=1.35 analog response curve.
   */
  isAnalogHorizontal() {
    return this._analogState.analogHorizontal === true;
  }

  /**
   * Filtered deterministic horizontal stick deflection in [-1, 1].
   */
  getHorizontalAxis() {
    if (this._analogState.analogHorizontal) {
      return this._analogState.filteredX;
    }
    const right = this._state[Actions.RIGHT] ? 1 : 0;
    const left = this._state[Actions.LEFT] ? 1 : 0;
    return right - left;
  }

  /**
   * Live analog & DualShock 4 button telemetry object.
   */
  getAnalogState() {
    return this._analogState;
  }

  /**
   * Stage 20 Hitstop Buffer Replay: inject latched edge triggers captured during
   * a hitstop freeze so pressedThisFrame(action) fires cleanly on the first unfrozen tick.
   */
  injectBufferedPresses(bufferedMap) {
    if (!bufferedMap) return;
    for (let i = 0; i < ACTION_LIST.length; i++) {
      const action = ACTION_LIST[i];
      this._injectedPresses[action] = bufferedMap[action] === true;
    }
  }

  /**
   * Clear any one-tick injected buffered presses after the unfrozen simulation tick consumes them.
   */
  clearInjectedPresses() {
    for (let i = 0; i < ACTION_LIST.length; i++) {
      this._injectedPresses[ACTION_LIST[i]] = false;
    }
  }

  /**
   * Get a deterministic snapshot of current input state (digital bitmask + quantized polar analog bytes).
   * Packed into a 25-bit unsigned integer for 100% backwards compatibility with v1 numeric frames.
   */
  getSnapshot() {
    let bitmask = 0;
    for (let i = 0; i < ACTION_LIST.length; i++) {
      if (this._state[ACTION_LIST[i]]) bitmask |= (1 << i);
    }
    return packInputFrame(
      bitmask,
      this._analogState.angleByte,
      this._analogState.magByte,
      this._analogState.analogHorizontal
    );
  }

  /**
   * Detailed structured snapshot for inspection/debugging.
   */
  getDetailedSnapshot() {
    const packed = this.getSnapshot();
    const unpacked = unpackInputFrame(packed);
    return { ...unpacked, packed };
  }

  /**
   * Apply a snapshot (legacy 8-bit bitmask, v2 25-bit packed integer, or object `{ bitmask, angleByte, magByte }`).
   */
  applySnapshot(snapshot) {
    const { bitmask, angleByte, magByte, analogActive } = unpackInputFrame(snapshot);

    for (const action of ACTION_LIST) {
      this._prevState[action] = this._state[action];
    }
    for (let i = 0; i < ACTION_LIST.length; i++) {
      this._state[ACTION_LIST[i]] = !!(bitmask & (1 << i));
    }

    // Reconstruct exact deterministic analog vector from polar bytes
    const a = this._analogState;
    if (analogActive && magByte > 0) {
      const deq = dequantizeAnalogStick(angleByte, magByte);
      a.filteredX = deq.x;
      a.filteredY = deq.y;
      a.rawX = deq.x;
      a.rawY = deq.y;
      a.magnitude = deq.magnitude;
      a.angle = deq.angle;
      a.angleByte = angleByte;
      a.magByte = magByte;
      a.inDeadzone = false;
      a.analogActive = true;
      a.analogHorizontal = true;
    } else {
      a.filteredX = 0;
      a.filteredY = 0;
      a.magnitude = 0;
      a.angle = 0;
      a.angleByte = 0;
      a.magByte = 0;
      a.inDeadzone = true;
      a.analogActive = false;
      a.analogHorizontal = false;
    }

    for (const action of ACTION_LIST) {
      if (this._state[action]) {
        this._framesHeld[action]++;
      } else {
        this._framesHeld[action] = 0;
      }
    }
  }

  /**
   * Helper to build an action bitmask from a list or map of action names.
   */
  static encodeActions(actions) {
    let bitmask = 0;
    const set = Array.isArray(actions) ? new Set(actions) : null;
    for (let i = 0; i < ACTION_LIST.length; i++) {
      const name = ACTION_LIST[i];
      if (set ? set.has(name) : actions[name]) {
        bitmask |= (1 << i);
      }
    }
    return bitmask;
  }

  // ─── Recording & Replay (v2 Deterministic Analog + Digital) ─

  startRecording(meta = {}) {
    this._recording = [];
    this._recordingMeta = { ...meta };
    this._isRecording = true;
  }

  stopRecording() {
    this._isRecording = false;
    return {
      version: 2,
      meta: this._recordingMeta || {},
      frames: this._recording ? [...this._recording] : [],
    };
  }

  _recordFrame() {
    this._recording.push(this.getSnapshot());
  }

  exportReplayJSON() {
    const payload = this._isRecording
      ? { version: 2, meta: this._recordingMeta || {}, frames: [...this._recording] }
      : { version: 2, meta: this._recordingMeta || {}, frames: this._recording ? [...this._recording] : [] };
    return JSON.stringify(payload);
  }

  loadReplay(replayData) {
    const frames = Array.isArray(replayData) ? replayData : replayData?.frames;
    if (!Array.isArray(frames)) return false;
    this.clearInputs();
    this._replay = frames;
    this._replayFrame = 0;
    this._isReplaying = true;
    return true;
  }

  loadReplayJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    this.loadReplay(parsed);
    return parsed;
  }

  stopReplay() {
    this._isReplaying = false;
    this._replay = null;
    this._replayFrame = 0;
  }

  _applyReplayFrame() {
    if (this._replayFrame >= this._replay.length) {
      this.stopReplay();
      this.applySnapshot(0);
      return;
    }
    this.applySnapshot(this._replay[this._replayFrame]);
    this._replayFrame++;
  }

  get isReplaying() { return this._isReplaying; }
  get isRecording() { return this._isRecording; }
  get recordedFramesCount() { return this._recording ? this._recording.length : 0; }
  get replayProgress() {
    return {
      frame: this._replayFrame,
      total: this._replay ? this._replay.length : 0,
    };
  }
}

export default InputManager;
