/**
 * Diegetic Minimalist Top-Bar HUD — Stage 19 (`src/ui/hud.js`)
 * ============================================================
 * Fixed top-bar status panel maximizing playable screen real estate:
 *   - Lives Counter (clean emblem icon + 'x3')
 *   - Coin / Sparking Gold Shard Tally (continuously rotating geometric shard + '42/100')
 *   - Star Medallion Sockets (3 circular glyphs lighting bright gold on collection)
 *   - Level Identifier ('1-1', '1-2', '1-3') + subtle Kishōtenketsu Act tag
 *   - Countdown Timer (300s, amber warning flash + '!' badge strictly at < 50s)
 *   - Compact Power-Up Form emblem & CLEAR! badge
 *
 * Performance & Accessibility Discipline:
 *   - Pure DOM ref updates via engine.subscribeUITick (ZERO 60 Hz React re-renders)
 *   - ZERO backdrop-filter over active canvas
 *   - tabular-nums across all counters
 *   - Non-color-only warning cue ('!' badge + amber flash border at < 50s)
 *   - Pure React.createElement (no JSX) so Node ESM tests can import helpers directly.
 */

import React, { useEffect, useRef } from 'react';
import MovementProfile from '../game/config/MovementProfile.js';
import { PowerUpForm } from '../game/powerups/PowerUp.js';

const FORM_BADGES = {
  [PowerUpForm.SMALL]: {
    short: 'S',
    title: 'Small',
    bg: 'rgba(30, 41, 59, 0.96)',
    border: '#64748B',
    color: '#CBD5E1',
  },
  [PowerUpForm.SUPER]: {
    short: 'M',
    title: 'Super',
    bg: 'rgba(153, 27, 27, 0.96)',
    border: '#F87171',
    color: '#FEF08A',
  },
  [PowerUpForm.FIRE]: {
    short: 'F',
    title: 'Fire',
    bg: 'rgba(194, 65, 12, 0.96)',
    border: '#FB923C',
    color: '#FEF9C3',
  },
};

const ACT_META = {
  KI: { short: 'KI', color: '#4ADE80' },
  SHO: { short: 'SHŌ', color: '#38BDF8' },
  TEN: { short: 'TEN', color: '#F59E0B' },
  KETSU: { short: 'KETSU', color: '#C084FC' },
};

/**
 * Derive crisp course identifier ('1-1', '1-2', '1-3', 'W-S', or 'R-01'..'R-10').
 */
export function resolveCourseIdentifier(room, roomIndex = 0) {
  if (!room) return `R-${String((roomIndex ?? 0) + 1).padStart(2, '0')}`;
  if (room.courseCode) return String(room.courseCode);
  if (room.levelSchema?.code) return String(room.levelSchema.code);
  const name = String(room.name || '');
  const match = name.match(/\b(\d+-\d+)\b/);
  if (match) return match[1];
  if (room.isKishotenketsu) return 'W-S';
  return `R-${String((roomIndex ?? 0) + 1).padStart(2, '0')}`;
}

/**
 * Format lives counter strictly as 'x3' (clean icon + 'xN').
 */
export function formatLivesDisplay(lives = 3) {
  const safe = Math.max(0, Math.min(99, Math.floor(Number.isFinite(lives) ? lives : 3)));
  return `x${safe}`;
}

/**
 * Format Sparking Gold Shard tally toward 100-shard 1-UP rollover (e.g. '42/100', '00/100').
 */
export function formatShardTallyDisplay(
  shardCount = 0,
  shardsPerOneUp = MovementProfile.collectibles.shardsPerOneUp
) {
  const cap = Math.max(1, Math.floor(shardsPerOneUp));
  const safe = Math.max(0, Math.floor(Number.isFinite(shardCount) ? shardCount : 0)) % cap;
  return `${String(safe).padStart(2, '0')}/${cap}`;
}

/**
 * Compute Countdown Timer HUD state with amber warning flash strictly at < 50s.
 */
export function computeTimerHUDState(timerSeconds = 300, animTimeSec = 0) {
  const cCfg = MovementProfile.collectibles;
  const seconds = Math.max(0, Math.min(999, Math.floor(Number.isFinite(timerSeconds) ? timerSeconds : 300)));
  const isWarning = seconds < cCfg.timerWarningThresholdSec;
  const flashPhase = Math.floor(Math.max(0, animTimeSec) * cCfg.timerWarningFlashHz * 2) % 2;
  const isFlashOn = isWarning && flashPhase === 0;
  const color = isWarning ? (isFlashOn ? '#F59E0B' : '#FEF3C7') : '#F8FAFC';

  return {
    seconds,
    text: `${String(seconds).padStart(3, '0')}s`,
    isWarning,
    isFlashOn,
    color,
  };
}

/**
 * Compute continuous horizontal spin transform for the geometric Gold Shard HUD icon.
 */
export function computeShardRotationTransform(animTimeSec = 0) {
  const degPerSec = MovementProfile.collectibles.shardRotateDegPerSec;
  const angleDeg = (Math.max(0, animTimeSec) * degPerSec) % 360;
  const rad = (angleDeg * Math.PI) / 180;
  const scaleX = Number(Math.max(0.24, Math.abs(Math.cos(rad))).toFixed(3));
  return {
    angleDeg: Number(angleDeg.toFixed(1)),
    scaleX,
    cssTransform: `scaleX(${scaleX})`,
  };
}

/**
 * Build complete pure HUD view-model snapshot from GameEngine state.
 */
export function buildDiegeticHUDState(engine, animTimeSec = 0) {
  const room = engine?.currentRoom || null;
  const roomIndex = engine?.currentRoomIndex ?? 0;
  const economy = engine?.collectibles;
  const combat = engine?.combat;
  const levelKit = engine?.levelKit;
  const levelEngine = engine?.levelEngine;

  const lives = economy ? economy.lives : (combat?.lives ?? 3);
  const shardCount = economy ? economy.shardCount : (levelKit?.coinsCollected ?? 0);
  const sockets = economy
    ? economy.getCourseSockets()
    : [0, 1, 2].map((i) => Boolean(levelEngine?.starMedallions?.[i]?.collected || levelEngine?.starMedallions?.[i]?.persisted));

  const timer = computeTimerHUDState(engine?.timerSeconds ?? MovementProfile.hud.initialTimeSeconds, animTimeSec);
  const shardSpin = computeShardRotationTransform(animTimeSec);

  return {
    levelId: resolveCourseIdentifier(room, roomIndex),
    actId: levelEngine?.active ? (levelEngine.currentActId || 'KI') : null,
    twistActive: Boolean(levelEngine?.active && levelEngine.twistActive),
    lives,
    livesText: formatLivesDisplay(lives),
    shardCount,
    shardText: formatShardTallyDisplay(shardCount),
    shardSpin,
    sockets,
    medallionsCollected: sockets.filter(Boolean).length,
    timer,
    powerUpForm: engine?.player?.powerUpForm || PowerUpForm.SMALL,
    courseCleared: Boolean(levelKit?.courseCleared),
  };
}

const h = React.createElement;

function buildCapIcon() {
  return h(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 18 18',
      'aria-hidden': 'true',
      className: 'mwe-hud-icon',
    },
    h('path', {
      d: 'M3 10.5C3 6.6 5.7 4 9.2 4C12.7 4 15 6.3 15 9.8H16.5C16.8 10.7 16.2 11.8 14.8 12.1L12.6 12.4H4.2C3.3 12.4 2.8 11.5 3 10.5Z',
      fill: '#EF4444',
      stroke: '#FCA5A5',
      strokeWidth: '1.1',
    }),
    h('circle', { cx: 9.2, cy: 7.9, r: 2.1, fill: '#FEF2F2' }),
    h('path', {
      d: 'M8.2 8.7V7.1L9.2 8.1L10.2 7.1V8.7',
      fill: 'none',
      stroke: '#DC2626',
      strokeWidth: '1.1',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  );
}

function buildShardIcon(iconRef) {
  return h(
    'span',
    {
      ref: iconRef,
      'data-testid': 'hud-shard-icon',
      className: 'mwe-hud-shard-spin',
      'aria-hidden': 'true',
    },
    h(
      'svg',
      { width: 15, height: 18, viewBox: '0 0 16 20' },
      h('polygon', {
        points: '8,1 15,10 8,19 1,10',
        fill: '#FACC15',
        stroke: '#92400E',
        strokeWidth: '1.4',
      }),
      h('polygon', {
        points: '8,2.5 8,17.5 2.6,10',
        fill: '#FEF08A',
      }),
      h('polygon', {
        points: '8,5.5 11,10 8,14.5 5,10',
        fill: '#FFFBEB',
      })
    )
  );
}

function buildStarSocket(index, socketRef) {
  return h(
    'span',
    {
      key: index,
      ref: socketRef,
      'data-testid': `hud-medallion-socket-${index}`,
      'data-collected': 'false',
      className: 'mwe-medallion-socket',
      title: `Star Medallion ${index + 1}`,
      'aria-label': `Star Medallion ${index + 1} uncollected`,
    },
    h(
      'svg',
      { width: 14, height: 14, viewBox: '0 0 20 20', 'aria-hidden': 'true' },
      h('polygon', {
        points: '10,1.6 12.6,7.1 18.6,7.8 14.1,11.9 15.3,17.9 10,14.9 4.7,17.9 5.9,11.9 1.4,7.8 7.4,7.1',
        className: 'mwe-medallion-star-poly',
      })
    )
  );
}

function buildClockIcon() {
  return h(
    'svg',
    {
      width: 13,
      height: 13,
      viewBox: '0 0 16 16',
      'aria-hidden': 'true',
      className: 'mwe-hud-icon',
    },
    h('circle', {
      cx: 8,
      cy: 8,
      r: 6.2,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.5',
    }),
    h('path', {
      d: 'M8 4.4V8.2L10.7 9.8',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    })
  );
}

/**
 * DiegeticHUD — Fixed Minimalist Top-Bar Status Panel
 */
export function DiegeticHUD({ engine, engineRef, showTelemetry = false }) {
  const formBadgeRef = useRef(null);
  const formShortRef = useRef(null);
  const livesRef = useRef(null);
  const shardWrapRef = useRef(null);
  const shardIconRef = useRef(null);
  const shardTextRef = useRef(null);
  const levelIdRef = useRef(null);
  const actTagRef = useRef(null);
  const timerWrapRef = useRef(null);
  const timerWarnBadgeRef = useRef(null);
  const timerTextRef = useRef(null);
  const clearBadgeRef = useRef(null);
  const socket0Ref = useRef(null);
  const socket1Ref = useRef(null);
  const socket2Ref = useRef(null);

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!activeEngine) return;

    const prev = {
      sockets: [null, null, null],
    };
    let bounceTimer = null;
    const socketRefs = [socket0Ref, socket1Ref, socket2Ref];

    const sync = (eng) => {
      if (!eng?.player) return;
      const animTime = eng.renderer?._animTime ?? (eng.loop?.totalTicks ?? 0) * MovementProfile.simulation.fixedTimeStep;
      const vm = buildDiegeticHUDState(eng, animTime);

      // 1. Power-up compact emblem
      if (prev.form !== vm.powerUpForm) {
        prev.form = vm.powerUpForm;
        const cfg = FORM_BADGES[vm.powerUpForm] || FORM_BADGES[PowerUpForm.SMALL];
        if (formBadgeRef.current) {
          formBadgeRef.current.style.background = cfg.bg;
          formBadgeRef.current.style.borderColor = cfg.border;
          formBadgeRef.current.style.color = cfg.color;
          formBadgeRef.current.title = `Form: ${cfg.title}`;
        }
        if (formShortRef.current) {
          formShortRef.current.textContent = cfg.short;
        }
      }

      // 2. Lives Counter ('x3')
      if (livesRef.current && prev.livesText !== vm.livesText) {
        prev.livesText = vm.livesText;
        livesRef.current.textContent = vm.livesText;
      }

      // 3. Rotating Geometric Gold Shard Icon + '42/100' Tally
      if (shardIconRef.current) {
        shardIconRef.current.style.transform = vm.shardSpin.cssTransform;
      }
      if (prev.shardText !== vm.shardText) {
        if (prev.shardText !== undefined && shardWrapRef.current) {
          shardWrapRef.current.classList.add('is-pop');
          clearTimeout(bounceTimer);
          bounceTimer = setTimeout(() => {
            shardWrapRef.current?.classList.remove('is-pop');
          }, 120);
        }
        prev.shardText = vm.shardText;
        if (shardTextRef.current) {
          shardTextRef.current.textContent = vm.shardText;
        }
      }

      // 4. Star Medallion Sockets (3 circular glyphs lighting bright gold)
      for (let i = 0; i < 3; i++) {
        const collected = Boolean(vm.sockets[i]);
        if (prev.sockets[i] !== collected) {
          prev.sockets[i] = collected;
          const el = socketRefs[i].current;
          if (el) {
            el.classList.toggle('is-collected', collected);
            el.dataset.collected = collected ? 'true' : 'false';
            el.setAttribute('aria-label', `Star Medallion ${i + 1} ${collected ? 'collected' : 'uncollected'}`);
          }
        }
      }

      // 5. Level Identifier ('1-1') + subtle Act badge
      if (levelIdRef.current && prev.levelId !== vm.levelId) {
        prev.levelId = vm.levelId;
        levelIdRef.current.textContent = vm.levelId;
      }
      const actKey = vm.actId ? `${vm.actId}${vm.twistActive ? '!' : ''}` : '';
      if (actTagRef.current && prev.actKey !== actKey) {
        prev.actKey = actKey;
        if (vm.actId) {
          const meta = ACT_META[vm.actId] || ACT_META.KI;
          actTagRef.current.style.display = 'inline-block';
          actTagRef.current.textContent = vm.twistActive ? `${meta.short}!` : meta.short;
          actTagRef.current.style.color = meta.color;
        } else {
          actTagRef.current.style.display = 'none';
        }
      }

      // 6. Countdown Timer (300s, amber warning flash strictly at < 50s)
      if (timerTextRef.current && prev.timerText !== vm.timer.text) {
        prev.timerText = vm.timer.text;
        timerTextRef.current.textContent = vm.timer.text;
      }
      if (timerWrapRef.current) {
        if (prev.timerWarning !== vm.timer.isWarning) {
          prev.timerWarning = vm.timer.isWarning;
          timerWrapRef.current.classList.toggle('is-warning', vm.timer.isWarning);
          timerWrapRef.current.dataset.warning = vm.timer.isWarning ? 'true' : 'false';
          if (timerWarnBadgeRef.current) {
            timerWarnBadgeRef.current.style.display = vm.timer.isWarning ? 'inline-flex' : 'none';
          }
        }
        if (prev.timerFlash !== vm.timer.isFlashOn) {
          prev.timerFlash = vm.timer.isFlashOn;
          timerWrapRef.current.classList.toggle('is-flash-on', vm.timer.isFlashOn);
        }
        if (timerTextRef.current && prev.timerColor !== vm.timer.color) {
          prev.timerColor = vm.timer.color;
          timerTextRef.current.style.color = vm.timer.color;
        }
      }

      // 7. Course Clear badge
      if (clearBadgeRef.current && prev.cleared !== vm.courseCleared) {
        prev.cleared = vm.courseCleared;
        clearBadgeRef.current.style.display = vm.courseCleared ? 'inline-flex' : 'none';
      }
    };

    sync(activeEngine);
    const unsub = activeEngine.subscribeUITick(sync);
    return () => {
      clearTimeout(bounceTimer);
      unsub();
    };
  }, [engine, engineRef]);

  return h(
    'header',
    {
      'data-testid': 'diegetic-hud',
      'aria-label': 'Course Status HUD',
      className: `mwe-diegetic-topbar${showTelemetry ? ' is-shifted' : ''}`,
    },
    // Compact Power-Up emblem
    h(
      'div',
      {
        ref: formBadgeRef,
        'data-testid': 'hud-powerup-badge',
        className: 'mwe-hud-form-circle',
        title: 'Form: Small',
      },
      h('span', { ref: formShortRef }, 'S')
    ),

    // Lives Counter (clean icon + 'x3')
    h(
      'div',
      {
        className: 'mwe-hud-group mwe-hud-lives',
        'data-testid': 'hud-lives',
      },
      buildCapIcon(),
      h('span', { ref: livesRef, className: 'mwe-hud-val' }, 'x3')
    ),

    h('span', { className: 'mwe-hud-sep', 'aria-hidden': 'true' }),

    // Coin / Sparking Gold Shard Tally (rotating geometric shard + '00/100')
    h(
      'div',
      {
        ref: shardWrapRef,
        className: 'mwe-hud-group mwe-hud-shards',
        'data-testid': 'hud-shard-tally',
      },
      buildShardIcon(shardIconRef),
      h('span', { ref: shardTextRef, 'data-testid': 'coin-count', className: 'mwe-hud-val mwe-hud-gold' }, '00/100')
    ),

    h('span', { className: 'mwe-hud-sep', 'aria-hidden': 'true' }),

    // Star Medallion Sockets (3 circular glyphs lighting gold on collection)
    h(
      'div',
      {
        className: 'mwe-hud-group mwe-medallion-sockets',
        'data-testid': 'hud-medallion-sockets',
        'aria-label': 'Star Medallion Sockets',
      },
      buildStarSocket(0, socket0Ref),
      buildStarSocket(1, socket1Ref),
      buildStarSocket(2, socket2Ref)
    ),

    h('span', { className: 'mwe-hud-sep', 'aria-hidden': 'true' }),

    // Level Identifier ('1-1') + subtle Act indicator
    h(
      'div',
      {
        className: 'mwe-hud-group mwe-hud-level',
        'data-testid': 'hud-level-id',
      },
      h('span', { className: 'mwe-hud-kicker' }, 'COURSE'),
      h('span', { ref: levelIdRef, className: 'mwe-hud-val mwe-hud-course-code' }, '1-1'),
      h('span', { ref: actTagRef, 'data-testid': 'hud-act-badge', className: 'mwe-hud-act-tag' }, 'KI')
    ),

    h('span', { className: 'mwe-hud-sep', 'aria-hidden': 'true' }),

    // Countdown Timer (300s, amber warning flash at < 50s)
    h(
      'div',
      {
        ref: timerWrapRef,
        className: 'mwe-hud-group mwe-hud-timer',
        'data-testid': 'hud-timer',
        'data-warning': 'false',
      },
      buildClockIcon(),
      h('span', { ref: timerWarnBadgeRef, className: 'mwe-timer-warn-glyph', 'aria-label': 'Low time warning' }, '!'),
      h('span', { ref: timerTextRef, 'data-testid': 'hud-time', className: 'mwe-hud-val' }, '300s')
    ),

    // Course Clear pill (hidden until courseCleared)
    h(
      'span',
      {
        ref: clearBadgeRef,
        'data-testid': 'course-clear-badge',
        className: 'mwe-hud-clear-badge',
      },
      'CLEAR!'
    )
  );
}

export default DiegeticHUD;
