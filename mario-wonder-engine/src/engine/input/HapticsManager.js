/**
 * HapticsManager — Asymmetric Dual-Motor Tactile Feedback Engine
 * ================================================================
 * Drives W3C `gamepad.vibrationActuator` (`dual-rumble`) with physical motor
 * specialization:
 *   - Heavy Motor (strongMagnitude / Left Weight): Ground slams, shell kicks, damage shock
 *   - Light Motor (weakMagnitude / Right Weight): Surface friction, coins, skids, stomps
 *
 * Enforces a strict >= 20ms cooldown between sequential actuator calls to prevent
 * browser promise saturation and fails silently when unsupported.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

class HapticsManager {
  constructor(hardwareManager = null) {
    this._hardware = hardwareManager;
    this.enabled = true;
    this._lastActuationMs = -Infinity;
    this._pendingSecondPulseTimer = null;
    this._skidTickCounter = 0;
    this._wallSlideTickCounter = 0;

    // Diagnostics / telemetry counters
    this.lastEventName = 'idle';
    this.lastProfile = null;
    this.callCount = 0;
    this.throttledCount = 0;
    this.errorCount = 0;
    this._nowFn = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  setHardwareManager(hardwareManager) {
    this._hardware = hardwareManager;
  }

  /**
   * Custom clock injection for deterministic headless tests.
   */
  setClock(nowFn) {
    this._nowFn = typeof nowFn === 'function' ? nowFn : () => Date.now();
  }

  get isSupported() {
    const gp = this._getActiveGamepad();
    return Boolean(gp && gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function');
  }

  _getActiveGamepad() {
    if (!this._hardware) return null;
    return this._hardware.pollActiveGamepad();
  }

  /**
   * Play a dual-rumble effect safely with >= 20ms cooldown throttling.
   * Never throws or leaves unhandled Promise rejections.
   */
  playEffect(eventName, profileOverride = null) {
    if (!this.enabled) return false;

    const cfg = MovementProfile.haptics;
    const profile = profileOverride || cfg.profiles[eventName];
    if (!profile) return false;

    const now = this._nowFn();
    if (now - this._lastActuationMs < cfg.minCooldownMs) {
      this.throttledCount++;
      return false;
    }

    const gp = this._getActiveGamepad();
    const actuator = gp?.vibrationActuator;
    if (!actuator || typeof actuator.playEffect !== 'function') {
      return false;
    }

    this._lastActuationMs = now;
    this.lastEventName = eventName;
    this.lastProfile = {
      duration: profile.duration,
      weakMagnitude: profile.weakMagnitude,
      strongMagnitude: profile.strongMagnitude,
    };
    this.callCount++;

    const effectParams = {
      startDelay: 0,
      duration: profile.doublePulse ? Math.round(profile.duration * 0.45) : profile.duration,
      weakMagnitude: Math.max(0, Math.min(1, profile.weakMagnitude ?? 0)),
      strongMagnitude: Math.max(0, Math.min(1, profile.strongMagnitude ?? 0)),
    };

    this._invokeActuator(actuator, effectParams);

    // High-trauma double pulse for player damage
    if (profile.doublePulse && typeof setTimeout !== 'undefined') {
      if (this._pendingSecondPulseTimer) {
        clearTimeout(this._pendingSecondPulseTimer);
      }
      const secondDelay = Math.max(cfg.minCooldownMs + 10, Math.round(profile.duration * 0.52));
      this._pendingSecondPulseTimer = setTimeout(() => {
        this._pendingSecondPulseTimer = null;
        if (!this.enabled) return;
        const activeGp = this._getActiveGamepad();
        const act = activeGp?.vibrationActuator;
        if (act && typeof act.playEffect === 'function') {
          this._lastActuationMs = this._nowFn();
          this._invokeActuator(act, {
            startDelay: 0,
            duration: Math.round(profile.duration * 0.48),
            weakMagnitude: effectParams.weakMagnitude,
            strongMagnitude: effectParams.strongMagnitude,
          });
        }
      }, secondDelay);
    }

    return true;
  }

  _invokeActuator(actuator, params) {
    try {
      const result = actuator.playEffect('dual-rumble', params);
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          this.errorCount++;
        });
      }
    } catch {
      this.errorCount++;
    }
  }

  // ─── Tactile Event Matrix Helpers ───────────────────────────

  triggerStompSproutling() {
    return this.playEffect('stompSproutling');
  }

  triggerGroundPound() {
    return this.playEffect('groundPound');
  }

  triggerHopliteShellKick() {
    return this.playEffect('hopliteShellKick');
  }

  /**
   * Pulsed every 4 frames during active skid deceleration (gritty tire-like friction).
   */
  tickSkidFriction(isSkidding) {
    if (!isSkidding) {
      this._skidTickCounter = 0;
      return false;
    }
    const interval = MovementProfile.haptics.skidPulseIntervalFrames;
    const shouldPulse = this._skidTickCounter % interval === 0;
    this._skidTickCounter++;
    if (shouldPulse) {
      return this.playEffect('skidDecel');
    }
    return false;
  }

  /**
   * Continuous subtle light-motor rumble while wall-sliding.
   */
  tickWallSlideFriction(isWallSliding) {
    if (!isWallSliding) {
      this._wallSlideTickCounter = 0;
      return false;
    }
    const interval = MovementProfile.haptics.wallSlideIntervalFrames;
    const shouldPulse = this._wallSlideTickCounter % interval === 0;
    this._wallSlideTickCounter++;
    if (shouldPulse) {
      return this.playEffect('wallSlide');
    }
    return false;
  }

  triggerPlayerDamage() {
    return this.playEffect('playerDamage');
  }

  triggerCoinCollect() {
    return this.playEffect('coinCollect');
  }

  triggerSuperSpring() {
    return this.playEffect('superSpring');
  }

  resetStats() {
    this.callCount = 0;
    this.throttledCount = 0;
    this.errorCount = 0;
    this._lastActuationMs = -Infinity;
    this._skidTickCounter = 0;
    this._wallSlideTickCounter = 0;
    if (this._pendingSecondPulseTimer) {
      clearTimeout(this._pendingSecondPulseTimer);
      this._pendingSecondPulseTimer = null;
    }
  }

  destroy() {
    this.resetStats();
  }
}

export default HapticsManager;
