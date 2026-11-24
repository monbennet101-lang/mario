/**
 * DualShock 4 / PS4 Controller Hardware, Radial Kinematics & Haptics Test Suite
 * ==============================================================================
 * Run with: node --test src/tests/dualshock4.test.js
 *
 * Verifies all DualShock 4 exit criteria:
 *  1. Deadzone Filter: (0.10, 0.10) -> (0.0000, 0.0000), outer saturation & γ=1.35 curve
 *  2. Thumb-Roll Simultaneous Actuation: Square held + Cross pressed across 120 frames
 *  3. Trigger Deadzone & Actuation: L2 (0.20 false / 0.36 true) & R2 (0.20 false / 0.26 true)
 *  4. Haptic Promise Safety: 50 consecutive stomp calls in 100ms cleanly throttled, zero uncaught errors
 *  5. Deterministic Replay Parity: 600 frames of analog stick + sprint jumps + trigger crouches -> 100% hash match
 *  6. Hardware Vendor Profiling, Layout Override, Hotplug Toast & Active Pad Auto-Switching
 *  7. 2D Spatial Menu Navigation (`findNextSpatialTarget`)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyScaledRadialDeadzone,
  computeAnalogTargetVelocity,
  getAnalogSpeedBand,
  quantizeAnalogStick,
  dequantizeAnalogStick,
  packInputFrame,
  unpackInputFrame,
} from '../engine/input/AnalogMath.js';
import GamepadHardwareManager, {
  ControllerProfile,
  LayoutOverride,
  identifyGamepad,
  parseVendorProductIds,
} from '../engine/input/GamepadHardware.js';
import HapticsManager from '../engine/input/HapticsManager.js';
import InputManager, { Actions, DualShockButton } from '../engine/input/InputManager.js';
import { findNextSpatialTarget } from '../engine/input/GamepadMenuNavigator.js';
import GameEngine from '../engine/core/GameEngine.js';
import MovementProfile, { resetMovementProfile } from '../game/config/MovementProfile.js';

/**
 * Helper to create a W3C-standard virtual Gamepad snapshot.
 */
function createVirtualGamepad({
  index = 0,
  id = 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  mapping = 'standard',
  connected = true,
  axes = [0, 0, 0, 0],
  pressed = [],
  buttonValues = {},
  vibrationActuator = null,
} = {}) {
  const buttons = Array.from({ length: 18 }, (_, i) => {
    const isPressed = pressed.includes(i);
    const val = buttonValues[i] !== undefined ? buttonValues[i] : isPressed ? 1.0 : 0.0;
    return {
      pressed: isPressed || val > 0.5,
      touched: isPressed || val > 0,
      value: val,
    };
  });
  return {
    index,
    id,
    mapping,
    connected,
    axes: [...axes],
    buttons,
    vibrationActuator,
    timestamp: Date.now(),
  };
}

// ─── TEST 1: SCALED RADIAL DEADZONE & ANALOG KINEMATICS ──────────────────────

test('DS4 [1/7] Deadzone Filter — (0.10, 0.10) filters to (0.0000, 0.0000) and preserves diagonals & γ=1.35 curve', () => {
  resetMovementProfile();

  // Euclidean magnitude sqrt(0.10^2 + 0.10^2) = 0.14142 <= 0.15 -> exact zero
  const inside = applyScaledRadialDeadzone(0.10, 0.10);
  assert.equal(inside.x, 0.0, 'x inside radial deadzone must be 0.0000');
  assert.equal(inside.y, 0.0, 'y inside radial deadzone must be 0.0000');
  assert.equal(inside.magnitude, 0.0);
  assert.equal(inside.inDeadzone, true);

  // Just outside inner deadzone on a 45° diagonal: unit direction must be preserved
  const diag = applyScaledRadialDeadzone(0.55, 0.55);
  assert.equal(diag.inDeadzone, false);
  const expectedRaw = Math.sqrt(0.55 * 0.55 + 0.55 * 0.55);
  const expectedNorm = (expectedRaw - 0.15) / (0.95 - 0.15);
  assert.ok(Math.abs(diag.magnitude - expectedNorm) < 1e-9, 'Normalized radial magnitude mismatch');
  assert.ok(Math.abs(diag.x - diag.y) < 1e-9, 'Diagonal symmetry broken (axial gate bias)');
  assert.ok(
    Math.abs(Math.sqrt(diag.x * diag.x + diag.y * diag.y) - expectedNorm) < 1e-9,
    'Filtered vector length mismatch'
  );

  // Outer saturation envelope at r = 0.95 clamps cleanly to magnitude 1.0
  const sat = applyScaledRadialDeadzone(0.95, 0.0);
  assert.equal(sat.x, 1.0);
  assert.equal(sat.y, 0.0);
  assert.equal(sat.magnitude, 1.0);

  const overSat = applyScaledRadialDeadzone(1.0, 0.0);
  assert.equal(overSat.x, 1.0);
  assert.equal(overSat.magnitude, 1.0);

  // Non-linear velocity response curve (γ = 1.35)
  const walkTop = MovementProfile.locomotion.walkTopSpeed; // 5.20
  const runTop = MovementProfile.locomotion.runTopSpeed;   // 9.20

  // Precision low-speed band (0.0 < |x| <= 0.55)
  const precisionVel = computeAnalogTargetVelocity(0.45, walkTop);
  const expectedPrec = Math.pow(0.45, 1.35) * walkTop; // ~1.77 tiles/s
  assert.ok(Math.abs(precisionVel - expectedPrec) < 1e-9);
  assert.ok(precisionVel >= 1.25 && precisionVel <= 3.50, `Precision velocity ${precisionVel} out of micro-step range`);
  assert.equal(getAnalogSpeedBand(0.45), 'PRECISION');

  // High-speed momentum band (|x| > 0.55) ramps smoothly to full walk & sprint top speed
  assert.equal(getAnalogSpeedBand(0.80), 'MOMENTUM');
  assert.equal(computeAnalogTargetVelocity(1.0, walkTop), walkTop);
  assert.equal(computeAnalogTargetVelocity(-1.0, runTop), -runTop);
  assert.equal(computeAnalogTargetVelocity(0.0, runTop), 0.0);

  // Quantization round-trip & 25-bit replay frame packing
  const q = quantizeAnalogStick(diag.x, diag.y);
  const deq = dequantizeAnalogStick(q.angleByte, q.magByte);
  assert.ok(Math.abs(deq.x - diag.x) < 0.02);
  assert.ok(Math.abs(deq.y - diag.y) < 0.02);

  const packed = packInputFrame(0b10101, q.angleByte, q.magByte, true);
  const unpacked = unpackInputFrame(packed);
  assert.equal(unpacked.bitmask, 0b10101);
  assert.equal(unpacked.angleByte, q.angleByte);
  assert.equal(unpacked.magByte, q.magByte);
  assert.equal(unpacked.analogActive, true);

  // Backwards compatibility: digital-only frames stay pure 8-bit masks
  assert.equal(packInputFrame(0b00010010, 0, 0, false), 0b00010010);
});

// ─── TEST 2: THUMB-ROLL SIMULTANEOUS ACTUATION ───────────────────────────────

test('DS4 [2/7] Thumb-Roll Simultaneous Actuation — Square held + Cross pressed across 120 frames without ghosting', () => {
  resetMovementProfile();
  const input = new InputManager();
  let padState = createVirtualGamepad();
  input.hardware.setVirtualGamepadProvider(() => [padState]);

  let jumpEdges = 0;
  for (let frame = 0; frame < 120; frame++) {
    // Hold Square continuously across all 120 frames; tap Cross on even frames (60 clean edges)
    const pressCross = frame % 2 === 0;
    const pressed = [DualShockButton.SQUARE];
    if (pressCross) pressed.push(DualShockButton.CROSS);
    padState = createVirtualGamepad({ pressed });

    input.poll();

    assert.equal(input.held(Actions.RUN), true, `Square (RUN) dropped on frame ${frame}`);
    assert.equal(input.held(Actions.JUMP), pressCross, `Cross (JUMP) mismatch on frame ${frame}`);
    if (pressCross) {
      assert.equal(input.pressedThisFrame(Actions.JUMP), true, `Cross rising edge missed on frame ${frame}`);
      jumpEdges++;
    } else {
      assert.equal(input.releasedThisFrame(Actions.JUMP), true, `Cross release edge missed on frame ${frame}`);
    }
    // Zero ghosting on unpressed actions
    assert.equal(input.held(Actions.SPIN), false);
    assert.equal(input.held(Actions.UP), false);
    assert.equal(input.held(Actions.DOWN), false);
  }
  assert.equal(jumpEdges, 60);
  assert.equal(input.framesHeld(Actions.RUN), 120);

  // Verify Circle (Spin), Triangle (Up), L1/R1 (Spin), D-Pad OR Stick symbiosis, Options, Touchpad, L3
  let f3Triggered = 0;
  let resetTriggered = 0;
  input.registerDebugKey('f3', () => { f3Triggered++; });
  input.registerDebugKey('r', () => { resetTriggered++; });

  padState = createVirtualGamepad({
    pressed: [
      DualShockButton.CIRCLE,
      DualShockButton.TRIANGLE,
      DualShockButton.DPAD_LEFT,
      DualShockButton.OPTIONS,
      DualShockButton.TOUCHPAD,
      DualShockButton.L3,
    ],
  });
  input.poll();
  assert.equal(input.held(Actions.SPIN), true, 'Circle must trigger SPIN');
  assert.equal(input.held(Actions.UP), true, 'Triangle must trigger UP');
  assert.equal(input.held(Actions.LEFT), true, 'D-Pad Left must trigger LEFT with 0-frame debounce');
  assert.equal(input.isAnalogHorizontal(), false, 'D-Pad horizontal takes digital priority over analog curve');
  assert.equal(input.held(Actions.PAUSE), true, 'Options must trigger PAUSE');
  assert.equal(f3Triggered, 1, 'Touchpad click must toggle Telemetry HUD [F3]');
  assert.equal(resetTriggered, 1, 'L3 click must trigger Room Reset [R]');

  // L1 & R1 dedicated bumper Spin
  padState = createVirtualGamepad({ pressed: [DualShockButton.L1] });
  input.poll();
  assert.equal(input.held(Actions.SPIN), true, 'L1 must trigger SPIN');

  padState = createVirtualGamepad({ pressed: [DualShockButton.R1] });
  input.poll();
  assert.equal(input.held(Actions.SPIN), true, 'R1 must trigger SPIN');

  // Stick left beyond -0.20 triggers LEFT even without D-Pad
  padState = createVirtualGamepad({ axes: [-0.50, 0, 0, 0] });
  input.poll();
  assert.equal(input.held(Actions.LEFT), true, 'Stick x_filt < -0.20 must trigger LEFT');
  assert.equal(input.isAnalogHorizontal(), true);
});

// ─── TEST 3: TRIGGER DEADZONE & ACTUATION ────────────────────────────────────

test('DS4 [3/7] Trigger Deadzone & Actuation — L2 (0.20 false, 0.36 true) and R2 (0.20 false, 0.26 true)', () => {
  resetMovementProfile();
  const input = new InputManager();
  let padState = createVirtualGamepad();
  input.hardware.setVirtualGamepadProvider(() => [padState]);

  // L2 at 0.20 -> must NOT actuate Down/Ground Pound (threshold 0.35)
  padState = createVirtualGamepad({ buttonValues: { [DualShockButton.L2]: 0.20 } });
  input.poll();
  assert.equal(input.held(Actions.DOWN), false, 'L2 at 0.20 must not trigger Actions.DOWN');
  assert.ok(Math.abs(input.getAnalogState().l2Pressure - 0.20) < 1e-6);

  // L2 at 0.36 -> MUST actuate Down immediately
  padState = createVirtualGamepad({ buttonValues: { [DualShockButton.L2]: 0.36 } });
  input.poll();
  assert.equal(input.held(Actions.DOWN), true, 'L2 at 0.36 must immediately trigger Actions.DOWN');
  assert.equal(input.pressedThisFrame(Actions.DOWN), true);

  // R2 at 0.20 -> must NOT actuate Run (threshold 0.25)
  padState = createVirtualGamepad({ buttonValues: { [DualShockButton.R2]: 0.20 } });
  input.poll();
  assert.equal(input.held(Actions.RUN), false, 'R2 at 0.20 must not trigger Actions.RUN');

  // R2 at 0.26 -> MUST actuate Run immediately
  padState = createVirtualGamepad({ buttonValues: { [DualShockButton.R2]: 0.26 } });
  input.poll();
  assert.equal(input.held(Actions.RUN), true, 'R2 at 0.26 must immediately trigger Actions.RUN');
  assert.equal(input.pressedThisFrame(Actions.RUN), true);
});

// ─── TEST 4: HAPTIC PROMISE SAFETY & TACTILE EVENT MATRIX ───────────────────

test('DS4 [4/7] Haptic Promise Safety — 50 stomp calls in 100ms throttled cleanly with zero uncaught rejections', async () => {
  resetMovementProfile();

  const dispatched = [];
  let rejectToggle = false;
  const mockActuator = {
    playEffect(type, params) {
      dispatched.push({ type, ...params });
      rejectToggle = !rejectToggle;
      if (rejectToggle) {
        return Promise.reject(new Error('Simulated browser actuator busy'));
      }
      return Promise.resolve('complete');
    },
  };

  const hardware = new GamepadHardwareManager();
  const mockPad = createVirtualGamepad({ vibrationActuator: mockActuator });
  hardware.setVirtualGamepadProvider(() => [mockPad]);

  const haptics = new HapticsManager(hardware);
  let nowMs = 1000;
  haptics.setClock(() => nowMs);

  // Dispatch 50 consecutive stomp calls over 100ms (2ms intervals)
  for (let i = 0; i < 50; i++) {
    haptics.triggerStompSproutling();
    nowMs += 2;
  }

  // Let microtask queue flush rejected promises to ensure zero unhandledRejection
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Cooldown is 20ms -> at most 5 calls in 100ms (at t=1000, 1020, 1040, 1060, 1080)
  assert.equal(haptics.callCount, 5, `Expected 5 unthrottled calls in 100ms, got ${haptics.callCount}`);
  assert.equal(haptics.throttledCount, 45, `Expected 45 throttled calls, got ${haptics.throttledCount}`);
  assert.ok(haptics.errorCount >= 2, 'Rejected actuator promises should be caught and counted safely');
  assert.equal(dispatched[0].type, 'dual-rumble');
  assert.equal(dispatched[0].duration, 45);
  assert.equal(dispatched[0].weakMagnitude, 0.85);
  assert.equal(dispatched[0].strongMagnitude, 0.15);

  // Verify remaining 7 haptic profiles with >= 25ms gaps
  dispatched.length = 0;
  nowMs += 50;
  assert.equal(haptics.triggerGroundPound(), true);
  assert.equal(dispatched.at(-1).duration, 130);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.20);
  assert.equal(dispatched.at(-1).strongMagnitude, 1.00);

  nowMs += 50;
  assert.equal(haptics.triggerHopliteShellKick(), true);
  assert.equal(dispatched.at(-1).duration, 60);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.65);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.70);

  nowMs += 50;
  assert.equal(haptics.triggerCoinCollect(), true);
  assert.equal(dispatched.at(-1).duration, 25);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.40);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.00);

  nowMs += 50;
  assert.equal(haptics.triggerSuperSpring(), true);
  assert.equal(dispatched.at(-1).duration, 80);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.80);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.40);

  nowMs += 50;
  assert.equal(haptics.triggerPlayerDamage(), true);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.95);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.90);

  // Skid deceleration pulses every 4 frames
  let skidPulses = 0;
  for (let f = 0; f < 12; f++) {
    nowMs += 25;
    if (haptics.tickSkidFriction(true)) skidPulses++;
  }
  assert.equal(skidPulses, 3, 'Skid friction should pulse on frames 0, 4, 8 (every 4 frames)');
  assert.equal(dispatched.at(-1).duration, 35);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.35);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.40);

  // Wall slide continuous light rumble
  nowMs += 50;
  assert.equal(haptics.tickWallSlideFriction(true), true);
  assert.equal(dispatched.at(-1).duration, 40);
  assert.equal(dispatched.at(-1).weakMagnitude, 0.12);
  assert.equal(dispatched.at(-1).strongMagnitude, 0.00);

  // Silent fallback when vibrationActuator is unavailable
  const noVibPad = createVirtualGamepad({ vibrationActuator: null });
  hardware.setVirtualGamepadProvider(() => [noVibPad]);
  nowMs += 50;
  assert.equal(haptics.isSupported, false);
  assert.equal(haptics.triggerGroundPound(), false);

  haptics.destroy();
});

// ─── TEST 5: DETERMINISTIC REPLAY PARITY (600 ANALOG + TRIGGER FRAMES) ──────

test('DS4 [5/7] Deterministic Replay Parity — 600 frames of analog stick, sprint jumps & L2 crouches yield 100% identical state hashes', () => {
  resetMovementProfile();

  // Build deterministic 600-frame DualShock 4 choreography
  function getScriptedDualShockFrame(frame) {
    const pressed = [];
    const buttonValues = {};
    let ax0 = 0;
    let ax1 = 0;

    if (frame < 120) {
      // Precision low-speed micro-stepping (x_raw = 0.42 -> filtered ~0.3375)
      ax0 = 0.42;
      ax1 = 0.08;
    } else if (frame < 260) {
      // Explosive momentum sprint right with Square held + Cross jumps
      ax0 = 0.92;
      ax1 = -0.10;
      pressed.push(DualShockButton.SQUARE);
      if ((frame >= 140 && frame < 168) || (frame >= 205 && frame < 232)) {
        pressed.push(DualShockButton.CROSS);
      }
    } else if (frame < 340) {
      // Trigger crouch slide via L2 = 0.72 + diagonal stick
      ax0 = 0.60;
      ax1 = 0.12;
      buttonValues[DualShockButton.L2] = 0.72;
    } else if (frame < 490) {
      // Reverse run left via R2 analog trigger (> 0.25) + diagonal jump
      ax0 = -0.88;
      ax1 = -0.20;
      buttonValues[DualShockButton.R2] = 0.85;
      if (frame >= 380 && frame < 410) {
        pressed.push(DualShockButton.CROSS);
      }
    } else {
      // Precision slow walk right + subtle drift inside deadzone at end
      ax0 = frame < 550 ? 0.35 : 0.08;
      ax1 = frame < 550 ? 0.0 : -0.09;
    }

    return createVirtualGamepad({ axes: [ax0, ax1, 0, 0], pressed, buttonValues });
  }

  // Record 600 frames on Engine A
  const engineA = new GameEngine();
  engineA.initHeadless(0);
  let liveFrame = 0;
  engineA.input.hardware.setVirtualGamepadProvider(() => [getScriptedDualShockFrame(liveFrame)]);
  engineA.input.startRecording({ roomIndex: 0, controller: 'DUALSHOCK4' });

  const hashesA = [];
  let analogFramesSeen = 0;
  for (let f = 0; f < 600; f++) {
    liveFrame = f;
    engineA.loop.stepFixed(1);
    hashesA.push(engineA.player.stateHash);
    if (engineA.input.isAnalogHorizontal()) analogFramesSeen++;
  }
  assert.ok(analogFramesSeen > 400, `Expected >400 analog horizontal frames, got ${analogFramesSeen}`);

  const replayJson = engineA.input.exportReplayJSON();
  const parsed = JSON.parse(replayJson);
  assert.equal(parsed.version, 2, 'Replay format must be version 2');
  assert.equal(parsed.frames.length, 600);
  assert.ok(parsed.frames.some((w) => w > 0xFF), 'Replay frames must serialize quantized analog polar bytes');

  // Replay on brand new Engine B with NO gamepad attached
  const engineB = new GameEngine();
  engineB.initHeadless(0);
  engineB.input.loadReplayJSON(replayJson);

  const hashesB = [];
  for (let f = 0; f < 600; f++) {
    engineB.loop.stepFixed(1);
    hashesB.push(engineB.player.stateHash);
  }

  assert.deepEqual(hashesB, hashesA, '600-frame analog + trigger replay diverged from live recording');
  assert.equal(engineB.player.pos.x, engineA.player.pos.x);
  assert.equal(engineB.player.pos.y, engineA.player.pos.y);
  assert.equal(engineB.player.vel.x, engineA.player.vel.x);
  assert.equal(engineB.player.vel.y, engineA.player.vel.y);
});

// ─── TEST 6: HARDWARE VENDOR PROFILING, OVERRIDE & ACTIVE PAD SWITCHING ─────

test('DS4 [6/7] Hardware Vendor Profiling, Layout Override, Hotplug Toast & Active Pad Auto-Switching', () => {
  resetMovementProfile();

  // Official Sony Vendor (054c) & Product IDs (05c4, 09cc, 0ce6, 0df2)
  const ids = [
    ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)', 'DualShock 4 Wireless Controller (v1)'],
    ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'DualShock 4 Wireless Controller (v2)'],
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'DualSense Wireless Controller'],
    ['054c-0df2-Sony Interactive Entertainment DualSense Edge', 'DualSense Edge Controller'],
  ];
  for (const [idStr, expectedName] of ids) {
    const info = identifyGamepad(createVirtualGamepad({ id: idStr }));
    assert.equal(info.profile, ControllerProfile.DUALSHOCK4, `Failed Sony ID detection for ${idStr}`);
    assert.equal(info.vendorId, '054c');
    assert.equal(info.displayName, expectedName);
  }

  // Regex fallback for third-party / Bluetooth PlayStation IDs without explicit hex IDs
  const regexInfo = identifyGamepad(createVirtualGamepad({ id: 'PLAYSTATION(R)4 Controller' }));
  assert.equal(regexInfo.profile, ControllerProfile.DUALSHOCK4);

  // Universal W3C standard fallback for generic/unknown vendors
  const genericInfo = identifyGamepad(createVirtualGamepad({ id: '8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)' }));
  assert.equal(genericInfo.profile, ControllerProfile.GENERIC);
  assert.equal(genericInfo.isStandard, true);
  assert.deepEqual(parseVendorProductIds('8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)'), {
    vendorId: '2dc8',
    productId: '6003',
  });

  // Xbox identification
  const xboxInfo = identifyGamepad(createVirtualGamepad({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)' }));
  assert.equal(xboxInfo.profile, ControllerProfile.XBOX);

  // Hotplug toast & 1-click Layout Override
  const hw = new GamepadHardwareManager();
  const toasts = [];
  hw.onToast((t) => toasts.push(t));

  const ds4Pad = createVirtualGamepad({
    index: 0,
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  });
  const xboxPad = createVirtualGamepad({
    index: 1,
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  });

  let padList = [ds4Pad, xboxPad];
  hw.setVirtualGamepadProvider(() => padList);
  hw.simulateConnect(ds4Pad);

  assert.equal(hw.effectiveProfile, ControllerProfile.DUALSHOCK4);
  assert.ok(
    toasts.at(-1).message.includes('DualShock 4 Wireless Controller (v2) Connected — PlayStation Layout Active'),
    `Unexpected toast: ${toasts.at(-1)?.message}`
  );

  // Active Pad Auto-Switching: pressing button on Pad 1 claims active control
  padList = [
    ds4Pad,
    createVirtualGamepad({
      index: 1,
      id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      pressed: [DualShockButton.CROSS],
    }),
  ];
  const active = hw.pollActiveGamepad();
  assert.equal(active.index, 1, 'Actuated second gamepad must claim active control');
  assert.equal(hw.effectiveProfile, ControllerProfile.XBOX);

  // Manual 1-click Layout Override forces PlayStation glyphs even on XInput / DS4Windows wrapper
  hw.setLayoutOverride(LayoutOverride.FORCE_PS4);
  assert.equal(hw.effectiveProfile, ControllerProfile.DUALSHOCK4);
  hw.setLayoutOverride(LayoutOverride.FORCE_XBOX);
  assert.equal(hw.effectiveProfile, ControllerProfile.XBOX);
  hw.setLayoutOverride(LayoutOverride.AUTO);
  assert.equal(hw.effectiveProfile, ControllerProfile.XBOX);

  // Mid-frame disconnect falls back cleanly to keyboard without throwing
  padList = [];
  assert.equal(hw.pollActiveGamepad(), null);
  assert.equal(hw.isConnected, false);
  assert.equal(hw.effectiveProfile, ControllerProfile.KEYBOARD);
});

// ─── TEST 7: 2D SPATIAL MENU NAVIGATION ──────────────────────────────────────

test('DS4 [7/7] Spatial Menu Navigation — 2D nearest-neighbor selection & wrap-around', () => {
  const grid = [
    { id: 'top-left', rect: { left: 100, top: 100, width: 120, height: 40 } },
    { id: 'top-right', rect: { left: 260, top: 100, width: 120, height: 40 } },
    { id: 'bot-left', rect: { left: 100, top: 170, width: 120, height: 40 } },
    { id: 'bot-right', rect: { left: 260, top: 170, width: 120, height: 40 } },
  ];

  assert.equal(findNextSpatialTarget(grid, 0, 'right'), 1);
  assert.equal(findNextSpatialTarget(grid, 0, 'down'), 2);
  assert.equal(findNextSpatialTarget(grid, 1, 'down'), 3);
  assert.equal(findNextSpatialTarget(grid, 3, 'left'), 2);
  assert.equal(findNextSpatialTarget(grid, 3, 'up'), 1);
  // Clean wrap-around at boundary
  assert.equal(findNextSpatialTarget(grid, 3, 'down'), 0);
  assert.equal(findNextSpatialTarget(grid, 0, 'up'), 3);
});
