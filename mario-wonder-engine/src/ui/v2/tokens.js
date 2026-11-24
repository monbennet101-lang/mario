/**
 * UI v2 Design Tokens (`src/ui/v2/tokens.js`)
 * ============================================
 * Single source of truth for every colour, font, size, radius, outline,
 * shadow, motion duration, easing curve, z-index, layout anchor, and rule
 * from `Mario-Style UI UX Design Spec.md` (§3 & §5).
 *
 * Components under `src/ui/v2/components/` MUST NEVER hard-code hex colours,
 * pixel sizes, or millisecond durations — always reference CSS custom properties
 * (`var(--ui-*)`) or these exported constants.
 */

export const TOKENS = {
  color: {
    // Semantic palette (§3.3)
    gold: '#FACC15',
    goldLight: '#FEF08A',
    goldDeep: '#B45309',
    purple: '#A855F7',
    purpleLight: '#E9D5FF',
    purpleDeep: '#6B21A8',
    green: '#22C55E',
    greenLight: '#BBF7D0',
    greenDeep: '#15803D',
    red: '#EF4444',
    redLight: '#FECACA',
    redDeep: '#B91C1C',
    blue: '#38BDF8',
    blueLight: '#BAE6FD',
    blueDeep: '#1D4ED8',
    white: '#FFFFFF',
    ink: '#0F172A',
    outline: '#111827',
    muted: '#CBD5E1',
    // Surfaces (flat, chunky, crisp dark-navy world-matched surfaces, zero backdrop-filter)
    surface: '#172038',
    surfaceRaised: '#1F2B4A',
    surfaceDeep: '#0D1426',
    surfaceChip: 'rgba(15, 23, 42, 0.92)',
    scrim: 'rgba(7, 11, 24, 0.78)',
    scrimSolid: 'rgba(7, 11, 24, 0.94)',
    focusRing: '#38BDF8',
    disabledSurface: 'rgba(30, 41, 59, 0.56)',
    disabledText: '#64748B',
  },

  font: {
    display: '"Fredoka", "Nunito", ui-rounded, system-ui, sans-serif',
    body: '"Barlow", "D-DIN", system-ui, -apple-system, sans-serif',
  },

  size: {
    hudNumber: 'clamp(1.35rem, 5vh, 2.5rem)',
    margin: '4vh',
    marginX: 'clamp(14px, 3vw, 40px)',
    iconHud: 'clamp(22px, 3.6vh, 34px)',
    bodySm: '0.875rem',
    bodyMd: '1rem',
    bodyLg: '1.125rem',
    titleSm: '1.35rem',
    titleMd: '2rem',
    titleLg: 'clamp(2.25rem, 5vw, 3.6rem)',
    touchMin: '44px',
  },

  radius: {
    chip: '18px',
    card: '24px',
    pill: '999px',
    box: '16px',
    sm: '10px',
  },

  outline: {
    width: '3px',
    widthThin: '2px',
    widthThick: '4px',
  },

  shadow: {
    offset: '0 4px 0 #0B1120',
    offsetSm: '0 3px 0 #0B1120',
    offsetLg: '0 8px 0 #0B1120',
    text: '0 3px 0 #0B1120',
  },

  motion: {
    tick: 320,          // ms — counter roll (spec §3.4: 250–400 ms)
    pop: 150,           // ms — scale pop settle (spec §3.4: ~150 ms)
    popScale: 1.2,      // scalar — scale pop peak (spec §3.4: ~120%)
    fadeIdle: 260,      // ms — hide-on-idle fade (spec §3.4: 200–300 ms)
    idleDelay: 3500,    // ms — idle dwell before fade when enabled
    pause: 80,          // ms — instant pause open/close (spec §7: < 100 ms)
    transition: 380,    // ms — wipe/fade transition (spec §3.4: <= 500 ms input block)
    damageShake: 280,   // ms — life meter damage shake & single pulse
    pickupFly: 340,     // ms — pickup flight to counter before number rolls
    easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  },

  z: {
    hud: 600,
    flyingPickup: 650,
    toast: 850,
    pause: 950,
    modal: 1000,
    transition: 1100,
    devMenu: 1200,
    safeOverlay: 1300,
  },

  layout: {
    safeMarginVh: 4,
    centreClearPct: 70,
    slots: {
      survival: 'top-left',
      objective: 'top-centre',
      wealth: 'top-right',
      context: 'top-right',
      prompt: 'bottom-left',
      toast: 'bottom-right',
    },
  },

  rules: {
    coinsPerLife: 100,
    maxLives: 99,
    maxCoins: 99,
    maxSpecialCurrency: 999,
    baseHealthWedges: 3,
    bonusHealthWedges: 3,
    collectibleSlots: 3,
    timerWarningSec: 100,
    timerFinalBeepSec: 10,
    respawnDelayMs: 1200,
    gameOverRetryLives: 5,
    gameOverPetalPenaltyCap: 50,
    textScales: [1.0, 1.15, 1.3],
  },

  players: [
    { id: 'p1', characterId: 'mario', name: 'Vanguard', short: 'P1', colorToken: 'var(--ui-color-red)', accentToken: 'var(--ui-color-red-light)', emblem: 'visor' },
    { id: 'p2', characterId: 'luigi', name: 'Zephyr', short: 'P2', colorToken: 'var(--ui-color-green)', accentToken: 'var(--ui-color-green-light)', emblem: 'wing' },
    { id: 'p3', characterId: 'ember', name: 'Ember', short: 'P3', colorToken: 'var(--ui-color-gold)', accentToken: 'var(--ui-color-gold-light)', emblem: 'flare' },
    { id: 'p4', characterId: 'tide', name: 'Tide', short: 'P4', colorToken: 'var(--ui-color-blue)', accentToken: 'var(--ui-color-blue-light)', emblem: 'wave' },
  ],
};

export const COMPONENT_STATES = [
  'default',
  'updating',
  'empty',
  'maximum',
  'disabled',
  'focused',
  'pressed',
];

export default TOKENS;
