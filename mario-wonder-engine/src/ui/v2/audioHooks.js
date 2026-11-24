/**
 * UI v2 Named Audio Hooks (`src/ui/v2/audioHooks.js`)
 * ====================================================
 * Spec §3.5: Every HUD and menu state change has a distinct short original sound:
 *   coinTick, specialCoinChime, lifeUp, damage, lowHealthLoop, timerWarning,
 *   menuMove, menuConfirm, menuBack, checkpointChime, reserveActivate, courseClearFanfare.
 *
 * Delegates to the engine's procedural Web Audio synthesizer (`AudioManager`)
 * when available, and gracefully records silent hook events in headless/test runs.
 */

export const UISoundHook = {
  COIN_TICK: 'coinTick',
  SPECIAL_COIN_CHIME: 'specialCoinChime',
  LIFE_UP: 'lifeUp',
  DAMAGE: 'damage',
  LOW_HEALTH_PULSE: 'lowHealthPulse',
  TIMER_WARNING: 'timerWarning',
  MENU_MOVE: 'menuMove',
  MENU_CONFIRM: 'menuConfirm',
  MENU_BACK: 'menuBack',
  CHECKPOINT_CHIME: 'checkpointChime',
  RESERVE_ACTIVATE: 'reserveActivate',
  COURSE_CLEAR_FANFARE: 'courseClearFanfare',
};

class UIAudioBridge {
  constructor() {
    this._audio = null;
    this.triggeredHooks = [];
  }

  attach(audioManager) {
    this._audio = audioManager || null;
  }

  _playShortTone(freqStart, freqEnd, durationSec, type = 'triangle', gainPeak = 0.08) {
    const audio = this._audio;
    if (!audio || !audio.ctx || audio.muted || audio.ctx.state !== 'running') return;
    try {
      const now = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      const gain = audio.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), now + durationSec);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainPeak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
      osc.connect(gain);
      gain.connect(audio.masterGain);
      osc.start(now);
      osc.stop(now + durationSec + 0.01);
    } catch {
      // Ignore Web Audio scheduling errors in restricted contexts
    }
  }

  play(hookName) {
    if (this.triggeredHooks.length >= 64) {
      this.triggeredHooks.shift();
    }
    this.triggeredHooks.push(hookName);

    const audio = this._audio;
    switch (hookName) {
      case UISoundHook.COIN_TICK:
        if (audio?.playCoinCollect) audio.playCoinCollect();
        else this._playShortTone(980, 1480, 0.07, 'sine', 0.07);
        break;
      case UISoundHook.SPECIAL_COIN_CHIME:
        if (audio?.playStarMedallion) audio.playStarMedallion();
        else this._playShortTone(660, 1320, 0.16, 'triangle', 0.09);
        break;
      case UISoundHook.LIFE_UP:
        if (audio?.playOneUp) audio.playOneUp();
        else this._playShortTone(520, 1040, 0.18, 'triangle', 0.09);
        break;
      case UISoundHook.DAMAGE:
        if (audio?.playDamage) audio.playDamage(false);
        else this._playShortTone(320, 110, 0.14, 'sawtooth', 0.08);
        break;
      case UISoundHook.LOW_HEALTH_PULSE:
        this._playShortTone(440, 390, 0.09, 'sine', 0.06);
        break;
      case UISoundHook.TIMER_WARNING:
        this._playShortTone(880, 940, 0.08, 'square', 0.05);
        break;
      case UISoundHook.MENU_MOVE:
        this._playShortTone(540, 620, 0.045, 'triangle', 0.055);
        break;
      case UISoundHook.MENU_CONFIRM:
        if (audio?.playMenuConfirm) audio.playMenuConfirm();
        else this._playShortTone(620, 930, 0.08, 'triangle', 0.08);
        break;
      case UISoundHook.MENU_BACK:
        this._playShortTone(460, 310, 0.065, 'triangle', 0.06);
        break;
      case UISoundHook.CHECKPOINT_CHIME:
        if (audio?.playPowerUp) audio.playPowerUp('super_mushroom');
        else this._playShortTone(587, 1174, 0.15, 'triangle', 0.08);
        break;
      case UISoundHook.RESERVE_ACTIVATE:
        if (audio?.playPowerUp) audio.playPowerUp('fire_flower');
        else this._playShortTone(523, 1046, 0.14, 'sine', 0.08);
        break;
      case UISoundHook.COURSE_CLEAR_FANFARE:
        if (audio?.playFlagpoleFanfare) audio.playFlagpoleFanfare();
        break;
      default:
        break;
    }
    return hookName;
  }

  clearHistory() {
    this.triggeredHooks.length = 0;
  }
}

export const uiAudio = new UIAudioBridge();
export default uiAudio;
