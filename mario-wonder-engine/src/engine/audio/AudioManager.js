/**
 * AudioManager — Procedural Web Audio Sound Synthesizer
 * ======================================================
 * Zero external dependencies. Pure Web Audio API.
 * Stage 2:
 *   - Footstep ticks: Micro-pitch variations matched to walk/run stride frequencies
 *   - Skid screech: Frequency-modulated chirps when skidding
 *   - Crouch duck: Short low-pass swoosh + soft uncrouch pop
 */

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.muted = false;
    this._noiseBuffer = null;
    this._stepParity = 0;
    this._lastSkidMs = 0;
    this.lastPlayedCue = null;
    this.cueCount = 0;
    this.baseVolume = 0.28;
    this.duckingFactor = 1.0;
  }

  /**
   * Smoothly duck or restore master audio gain for lifecycle state transitions
   * (Title Screen, Pause Menu, Level Intro, Game Over vs Gameplay Active).
   */
  setDucking(factor = 1.0) {
    const clamped = Math.max(0, Math.min(1, Number(factor) || 0));
    this.duckingFactor = clamped;
    if (this.masterGain && this.ctx) {
      const target = this.muted ? 0 : this.baseVolume * this.duckingFactor;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(target, now, 0.05);
    }
    return this.duckingFactor;
  }

  _recordCue(name) {
    this.lastPlayedCue = name;
    this.cueCount++;
  }

  init() {
    if (this.ctx || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : this.baseVolume * this.duckingFactor;
    this.masterGain.connect(this.ctx.destination);
    this._noiseBuffer = this._createNoiseBuffer(0.35);
  }

  _createNoiseBuffer(seconds) {
    if (!this.ctx) return null;
    const length = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Ensure audio context is resumed (requires user gesture).
   */
  resume() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Footstep tick: crisp tactile boot tap with ±8% stride pitch variation.
   * @param {number} speedRatio — 0..1 normalized horizontal speed
   * @param {boolean} isSprint — true when above walk speed
   */
  playFootstep(speedRatio = 0.5, isSprint = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Alternate left/right foot pitch + slight organic jitter (±8%)
    this._stepParity = 1 - this._stepParity;
    const parityBias = this._stepParity === 0 ? 0.96 : 1.04;
    const jitter = 0.96 + Math.random() * 0.08;
    const baseFreq = (isSprint ? 195 : 155) * parityBias * jitter * (0.9 + speedRatio * 0.25);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(52, now + 0.042);

    const amp = 0.08 + speedRatio * 0.07;
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);

    // Subtle crisp sole brush using short bandpass noise
    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isSprint ? 2400 : 1800, now);
      filter.Q.value = 2.0;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.03 + speedRatio * 0.03, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.03);
    }
  }

  /**
   * Skid screech: frequency-modulated cartoon chirp during high-speed brake.
   */
  playSkid() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (nowMs - this._lastSkidMs < 85) return;
    this._lastSkidMs = nowMs;

    const now = this.ctx.currentTime;

    // Carrier + FM modulator for rubber-boot chirp
    const carrier = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    carrier.type = 'sawtooth';
    carrier.frequency.setValueAtTime(920, now);
    carrier.frequency.exponentialRampToValueAtTime(560, now + 0.09);

    mod.type = 'sine';
    mod.frequency.setValueAtTime(55, now);
    modGain.gain.setValueAtTime(110, now);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1350, now);
    filter.Q.value = 3.2;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    mod.start(now);
    carrier.start(now);
    mod.stop(now + 0.10);
    carrier.stop(now + 0.10);
  }

  /**
   * Crouch duck: short low-pass swoosh.
   */
  playCrouch() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Downward soft thump
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.08);
    oGain.gain.setValueAtTime(0.11, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);

    // Low-pass air swoosh
    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, now);
      filter.frequency.exponentialRampToValueAtTime(260, now + 0.09);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.09, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.10);
    }
  }

  /**
   * Uncrouch release: quick upward elastic pop.
   */
  playUncrouch() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(255, now + 0.055);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  /**
   * Jump chirp: upward frequency sweep modulated proportionally to launch velocity.
   * Higher pitch for sprint-boosted jumps; bright subtle shimmer if coyote/buffered.
   */
  playJump(launchVy = 18.6, baseVy = 18.6, viaCoyote = false, viaBuffer = false, combo = 1) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const boostRatio = Math.max(0, (launchVy - baseVy) / Math.max(0.1, baseVy));
    const comboMult = combo === 3 ? 1.26 : combo === 2 ? 1.12 : 1.0;
    const startFreq = (250 + boostRatio * 180) * (viaCoyote ? 1.06 : 1.0) * comboMult;
    const endFreq = (580 + boostRatio * 340 + (viaBuffer ? 40 : 0)) * comboMult;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.115);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.145);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.15);

    // Light harmonic overtone for Nintendo-style bright springiness
    const overtone = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    overtone.type = 'sine';
    overtone.frequency.setValueAtTime(startFreq * 1.5, now);
    overtone.frequency.exponentialRampToValueAtTime(endFreq * 1.4, now + 0.09);

    oGain.gain.setValueAtTime(0.045, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    overtone.connect(oGain);
    oGain.connect(this.masterGain);
    overtone.start(now);
    overtone.stop(now + 0.10);
  }

  /**
   * Landing thud: soft low-end grass impact + subtle dust brush scaled by impact speed.
   */
  playLand(impactSpeed = 10) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const intensity = Math.min(1, Math.max(0.25, impactSpeed / 22));

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125 + intensity * 35, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.07);

    gain.gain.setValueAtTime(0.10 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);

    if (this._noiseBuffer && intensity > 0.35) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900 + intensity * 600, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.055 * intensity, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.065);
    }
  }

  /**
   * Ceiling bonk: crisp muted block tap on overhead collision.
   */
  playBlockHit() {
    this._recordCue('blockHit');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(210, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.065);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(750, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  // ── Stage 4 Procedural Acrobatic Audio ──
  playSpin() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Swirling bandpass whoosh
    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, now);
      filter.frequency.exponentialRampToValueAtTime(2400, now + 0.14);
      filter.frequency.exponentialRampToValueAtTime(900, now + 0.28);
      filter.Q.value = 2.6;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.14, now + 0.03);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.30);
    }

    // Bright helicopter chirp
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.16);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.26);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  /**
   * Grounded Spin Jump: snappy spring launch + sparkling airy whirl.
   */
  playSpinJump() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(860, now + 0.14);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.30);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.33);

    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(2600, now + 0.18);
      filter.Q.value = 2.4;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.linearRampToValueAtTime(0.11, now + 0.02);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.31);
    }
  }

  playWallSlide() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (this._lastWallSlideMs && nowMs - this._lastWallSlideMs < 75) return;
    this._lastWallSlideMs = nowMs;

    const now = this.ctx.currentTime;
    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 + Math.random() * 350, now);
      filter.Q.value = 3.0;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.075, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.08);
    }
  }

  playWallJump() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(690, now + 0.11);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  playGroundPoundWindup() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.165);
  }

  playGroundPound() {
    this._recordCue('groundPound');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Deep sub-bass slam thud
    const sub = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, now);
    sub.frequency.exponentialRampToValueAtTime(34, now + 0.22);

    sGain.gain.setValueAtTime(0.28, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    sub.connect(sGain);
    sGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.26);

    // Punchy mid transient
    const punch = this.ctx.createOscillator();
    const pGain = this.ctx.createGain();
    punch.type = 'triangle';
    punch.frequency.setValueAtTime(210, now);
    punch.frequency.exponentialRampToValueAtTime(48, now + 0.10);

    pGain.gain.setValueAtTime(0.18, now);
    pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    punch.connect(pGain);
    pGain.connect(this.masterGain);
    punch.start(now);
    punch.stop(now + 0.13);

    // Heavy stone crunch noise
    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.18);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.16, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.20);
    }
  }

  // ── Stage 5 Procedural Slope & Semisolid Audio ──
  playSlopeSlide(speedRatio = 0.5) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const nowMs = performance.now();
    if (this._lastSlopeSlideMs && nowMs - this._lastSlopeSlideMs < 65) return;
    this._lastSlopeSlideMs = nowMs;

    const now = this.ctx.currentTime;
    const clampRatio = Math.max(0, Math.min(1, speedRatio));

    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650 + clampRatio * 1350, now);
      filter.Q.value = 2.4;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055 + clampRatio * 0.065, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.068);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.072);
    }

    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115 + clampRatio * 145, now);
    oGain.gain.setValueAtTime(0.025 + clampRatio * 0.03, now);
    oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(oGain);
    oGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playSemisolidDrop() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.085);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  /**
   * Stage 6: Hollow masonry thud when bumping a Brick or Question block.
   */
  playBlockBump() {
    this._recordCue('blockBump');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(195, now);
    osc.frequency.exponentialRampToValueAtTime(78, now + 0.085);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.10);

    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(620, now);
      filter.Q.value = 1.6;
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.09, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.06);
    }
  }

  /**
   * Stage 6: Punchy masonry crunch when shattering a Brick block into 4 debris shards.
   */
  playBrickBreak() {
    this._recordCue('brickBreak');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.frequency.exponentialRampToValueAtTime(340, now + 0.22);
      filter.Q.value = 1.1;

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.24);
    }

    // Dual tumbling stone clinks
    for (const [offset, freq] of [[0, 260], [0.045, 190]]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(72, now + offset + 0.075);
      gain.gain.setValueAtTime(0.09, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.085);
    }
  }

  /**
   * Stage 6: Iconic bright two-note Nintendo coin chime (B5 -> E6).
   */
  playCoinCollect() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const note1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    note1.type = 'square';
    note1.frequency.setValueAtTime(987.77, now); // B5
    g1.gain.setValueAtTime(0.11, now);
    g1.gain.exponentialRampToValueAtTime(0.08, now + 0.065);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    note1.connect(g1);
    g1.connect(this.masterGain);
    note1.start(now);
    note1.stop(now + 0.082);

    const note2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    note2.type = 'square';
    note2.frequency.setValueAtTime(1318.51, now + 0.065); // E6
    g2.gain.setValueAtTime(0.001, now);
    g2.gain.setValueAtTime(0.13, now + 0.065);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

    // Subtle low-pass softener so square timbre feels crisp, not harsh
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4200, now);

    note2.connect(filter);
    filter.connect(g2);
    g2.connect(this.masterGain);
    note2.start(now + 0.065);
    note2.stop(now + 0.35);
  }

  /**
   * Stage 6: Celebratory flagpole slide & course clear arpeggio.
   */
  playFlagpoleFanfare() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [
      [392.0, 0.0, 0.09],   // G4
      [523.25, 0.09, 0.09], // C5
      [659.25, 0.18, 0.09], // E5
      [783.99, 0.27, 0.14], // G5
      [659.25, 0.42, 0.09], // E5
      [1046.5, 0.52, 0.34], // C6
    ];
    for (const [freq, start, dur] of notes) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.14, now + start);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    }
  }

  /**
   * Stage 9: Punchy elastic enemy stomp pop with ascending combo pitch ladder.
   */
  playStomp(combo = 1) {
    this._recordCue('stomp');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const semitone = Math.pow(2, Math.min(7, Math.max(0, combo - 1)) / 12);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190 * semitone, now);
    osc.frequency.exponentialRampToValueAtTime(520 * semitone, now + 0.085);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);

    // Tactile bass thud on contact frame
    const sub = this.ctx.createOscillator();
    const sGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140, now);
    sub.frequency.exponentialRampToValueAtTime(48, now + 0.06);
    sGain.gain.setValueAtTime(0.14, now);
    sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    sub.connect(sGain);
    sGain.connect(this.masterGain);
    sub.start(now);
    sub.stop(now + 0.07);
  }

  /**
   * Stage 9: Ascending celebratory Nintendo-style power-up arpeggio.
   */
  playPowerUp(powerUpType = 'super_mushroom') {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const isFire = powerUpType === 'fire_flower';
    const freqs = isFire
      ? [392.0, 493.88, 587.33, 783.99, 987.77, 1174.66]
      : [261.63, 329.63, 392.0, 523.25, 659.25, 783.99];

    for (let i = 0; i < freqs.length; i++) {
      const start = now + i * 0.048;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freqs[i], start);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3400, start);

      gain.gain.setValueAtTime(0.10, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.095);
    }
  }

  /**
   * Stage 9: Crisp fireball snap-fwoosh projectile sound.
   */
  playFireball() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(840, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.09);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.exponentialRampToValueAtTime(700, now + 0.09);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.10);

    if (this._noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this._noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1900, now);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.06, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.065);
    }
  }

  /**
   * Stage 9: Crisp woody shell kick & ricochet clack.
   */
  playShellKick(comboOrBounce = 1) {
    this._recordCue('shellKick');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const mult = Math.min(1.8, 1.0 + Math.max(0, comboOrBounce - 1) * 0.08);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(420 * mult, now);
    osc.frequency.exponentialRampToValueAtTime(160 * mult, now + 0.075);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Stage 9: Form downgrade recoil buzz or Small Mario defeat cue.
   */
  playDamage(defeated = false) {
    this._recordCue('damage');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = defeated ? [392.0, 349.23, 311.13, 261.63, 196.0] : [360, 270, 195];
    const step = defeated ? 0.085 : 0.06;

    for (let i = 0; i < notes.length; i++) {
      const start = now + i * step;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(notes[i], start);
      osc.frequency.exponentialRampToValueAtTime(notes[i] * 0.85, start + step * 1.1);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, start);

      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + step * 1.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + step * 1.4);
    }
  }

  /**
   * Stage 10: Classic descending tri-pulse Warp Pipe suction audio cue.
   */
  playWarpPipe() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const pulses = [0, 0.08, 0.16];
    for (const offset of pulses) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now + offset);
      osc.frequency.exponentialRampToValueAtTime(160, now + offset + 0.068);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.072);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.075);
    }
  }

  /**
   * Enemy Gallery 1: Metallic bronze clank for Hoplite shell 100% elastic wall ricochet.
   */
  playBronzeRicochet(bounceCount = 1) {
    this._recordCue('bronzeRicochet');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const mult = Math.min(1.5, 1.0 + Math.max(0, bounceCount - 1) * 0.06);

    for (const [freq, amp, dur] of [[680 * mult, 0.14, 0.09], [1190 * mult, 0.09, 0.07]]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.62, now + dur);
      gain.gain.setValueAtTime(amp, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.01);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + dur + 0.015);
    }
  }

  /**
   * Enemy Gallery 1: Classic 6-note celebratory 1-UP chime on multi-kill completion.
   */
  playOneUp() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [659.25, 783.99, 1318.51, 1046.5, 1174.66, 1567.98];
    for (let i = 0; i < notes.length; i++) {
      const start = now + i * 0.072;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.11);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  /**
   * Environmental Props: Elastic Compression Spring launch cue.
   * Normal bounce = crisp mid boing; Super Spring = distinct high-pitch sparkling harmonic launch.
   */
  playSpringBounce(isSuper = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isSuper ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isSuper ? 440 : 230, now);
    osc.frequency.exponentialRampToValueAtTime(isSuper ? 1560 : 660, now + (isSuper ? 0.22 : 0.14));

    gain.gain.setValueAtTime(isSuper ? 0.20 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isSuper ? 0.26 : 0.16));

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + (isSuper ? 0.28 : 0.17));

    if (isSuper) {
      // Distinct high-pitch sparkle chime overtone for Timed Power Bounce
      const hi = this.ctx.createOscillator();
      const hiGain = this.ctx.createGain();
      hi.type = 'sine';
      hi.frequency.setValueAtTime(987.77, now + 0.02);
      hi.frequency.exponentialRampToValueAtTime(2349.32, now + 0.24);
      hiGain.gain.setValueAtTime(0.14, now + 0.02);
      hiGain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
      hi.connect(hiGain);
      hiGain.connect(this.masterGain);
      hi.start(now + 0.02);
      hi.stop(now + 0.28);
    }
  }

  /**
   * Environmental Props: Fall-Away platform detachment creak & drop thump.
   */
  playPlatformFallAway() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.18);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.21);
  }

  /**
   * Environmental Props: Warp Access Tube 45-frame conduit suction resonance.
   */
  playWarpTubeSlide(isExit = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const pulses = [0, 0.11, 0.22, 0.33];
    for (const offset of pulses) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const f0 = isExit ? 200 : 540;
      const f1 = isExit ? 580 : 155;
      osc.frequency.setValueAtTime(f0, now + offset);
      osc.frequency.exponentialRampToValueAtTime(f1, now + offset + 0.085);
      gain.gain.setValueAtTime(0.14, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.092);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.095);
    }
  }

  /**
   * Stage 17 (Act 3 Ten): Anticipated Twist Herald rumble + Wonder inversion shimmer.
   */
  playTwistHerald(isAnticipation = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    // Low anticipation earth/tide rumble
    const rumble = this.ctx.createOscillator();
    const rGain = this.ctx.createGain();
    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(isAnticipation ? 72 : 92, now);
    rumble.frequency.exponentialRampToValueAtTime(isAnticipation ? 54 : 46, now + (isAnticipation ? 0.22 : 0.36));
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(220, now);
    rGain.gain.setValueAtTime(isAnticipation ? 0.09 : 0.16, now);
    rGain.gain.exponentialRampToValueAtTime(0.001, now + (isAnticipation ? 0.24 : 0.38));
    rumble.connect(filter);
    filter.connect(rGain);
    rGain.connect(this.masterGain);
    rumble.start(now);
    rumble.stop(now + (isAnticipation ? 0.25 : 0.40));

    if (!isAnticipation) {
      // Bright Wonder-style ascending shimmer arpeggio confirming twist activation
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t = now + idx * 0.055;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(t);
        osc.stop(t + 0.25);
      });
    }
  }

  /**
   * Stage 17: Mastery Star Medallion collection fanfare triad.
   */
  playStarMedallion() {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [659.25, 880.0, 1174.66, 1567.98];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = now + idx * 0.048;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.29);
    });
  }

  /**
   * Stage 21: Dread-Shell Golem heavy ground slam impact + shockwave bass roar.
   */
  playBossSlam() {
    this._recordCue('bossSlam');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(118, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.34);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.40);
  }

  /**
   * Stage 21: Boss phase roar / overdrive escalation alarm.
   */
  playBossRoar(phase = 2) {
    this._recordCue('bossRoar');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const startFreq = phase >= 3 ? 210 : 165;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.42);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  /**
   * Stage 21: Shell strike against the Golem's exposed Power Core.
   */
  playBossCoreHit(strikeNumber = 1) {
    this._recordCue('bossCoreHit');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const pitchBoost = 1 + (strikeNumber - 1) * 0.16;
    const notes = [293.66 * pitchBoost, 440 * pitchBoost, 587.33 * pitchBoost];
    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = now + idx * 0.035;
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.20, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  /**
   * Stage 21: Boss Strike 3 Victory Fanfare (triumphant brass-like synth chord arpeggio).
   */
  playBossVictoryFanfare() {
    this._recordCue('bossVictoryFanfare');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const melody = [
      { f: 523.25, t: 0.00, d: 0.14 },
      { f: 659.25, t: 0.12, d: 0.14 },
      { f: 783.99, t: 0.24, d: 0.14 },
      { f: 1046.50, t: 0.36, d: 0.28 },
      { f: 880.00, t: 0.62, d: 0.14 },
      { f: 1046.50, t: 0.76, d: 0.55 },
    ];
    for (const n of melody) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      g.gain.setValueAtTime(0.22, now + n.t);
      g.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.02);
    }
  }

  /**
   * Stage 21: Clean Game Over descending cadence.
   */
  playGameOver() {
    this._recordCue('gameOver');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [392.0, 349.23, 329.63, 261.63];
    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const t = now + idx * 0.16;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  playMenuConfirm() {
    this._recordCue('menuConfirm');
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.09);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.baseVolume * this.duckingFactor;
    }
    return this.muted;
  }

  destroy() {
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
      this._noiseBuffer = null;
    }
  }
}

export default AudioManager;
