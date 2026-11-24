/**
 * WonderGameplayHUD — Stage 9/10 Bottom-Left Tactile HUD Cluster
 * ===============================================================
 * Renders via pure DOM refs on GameEngine ticks (zero 60 Hz React re-renders,
 * zero backdrop-filter):
 *   - Circular Power-Up Badge (SMALL / SUPER / FIRE)
 *   - Spinning Gold Coin icon & bouncy coin counter
 *   - 6-digit tabular SCORE counter
 *   - 3-digit countdown TIME (300s, amber below 60s)
 *   - Lives counter (x3) & Goal CLEAR! badge
 */

import React, { useEffect, useRef } from 'react';
import { PowerUpForm } from '@game/powerups/PowerUp';

const FORM_STYLES = {
  [PowerUpForm.SMALL]: {
    label: 'SMALL',
    short: 'S',
    bg: 'rgba(30, 41, 59, 0.95)',
    border: '#64748B',
    color: '#CBD5E1',
  },
  [PowerUpForm.SUPER]: {
    label: 'SUPER',
    short: 'M',
    bg: 'rgba(153, 27, 27, 0.95)',
    border: '#F87171',
    color: '#FEF08A',
  },
  [PowerUpForm.FIRE]: {
    label: 'FIRE [X/K]',
    short: 'F',
    bg: 'rgba(194, 65, 12, 0.96)',
    border: '#FB923C',
    color: '#FEF9C3',
  },
};

const ACT_LABELS = {
  KI: { label: '起 KI', color: '#4ADE80', border: 'rgba(74, 222, 128, 0.50)' },
  SHO: { label: '承 SHŌ', color: '#38BDF8', border: 'rgba(56, 189, 248, 0.50)' },
  TEN: { label: '転 TEN', color: '#F59E0B', border: 'rgba(245, 158, 11, 0.65)' },
  KETSU: { label: '結 KETSU', color: '#C084FC', border: 'rgba(192, 132, 252, 0.55)' },
};

function WonderGameplayHUD({ engine, engineRef, showTelemetry = false }) {
  const formBadgeRef = useRef(null);
  const formShortRef = useRef(null);
  const formLabelRef = useRef(null);
  const coinWrapRef = useRef(null);
  const coinTextRef = useRef(null);
  const scoreRef = useRef(null);
  const timeRef = useRef(null);
  const livesRef = useRef(null);
  const actWrapRef = useRef(null);
  const actBadgeRef = useRef(null);
  const routeBadgeRef = useRef(null);
  const starTextRef = useRef(null);
  const clearBadgeRef = useRef(null);

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!activeEngine) return;

    const prev = {};
    let bounceTimeout = null;

    const sync = (eng) => {
      const { player, levelKit, combat } = eng;
      if (!player || !levelKit || !combat) return;

      // 1. Power-Up Form Badge
      const form = player.powerUpForm || PowerUpForm.SMALL;
      if (prev.form !== form) {
        prev.form = form;
        const cfg = FORM_STYLES[form] || FORM_STYLES[PowerUpForm.SMALL];
        if (formBadgeRef.current) {
          formBadgeRef.current.style.background = cfg.bg;
          formBadgeRef.current.style.borderColor = cfg.border;
          formBadgeRef.current.style.color = cfg.color;
        }
        if (formShortRef.current) formShortRef.current.textContent = cfg.short;
        if (formLabelRef.current) {
          formLabelRef.current.textContent = cfg.label;
          formLabelRef.current.style.color = cfg.color;
        }
      }

      // 2. Coin counter + subtle bounce on collection
      const total = levelKit.totalWorldCoins;
      const coinLabel = total > 0
        ? `${String(levelKit.coinsCollected).padStart(2, '0')}/${total}`
        : `${String(levelKit.coinsCollected).padStart(2, '0')}`;
      if (prev.coins !== levelKit.coinsCollected) {
        if (prev.coins !== undefined && coinWrapRef.current) {
          coinWrapRef.current.style.transform = 'scale(1.16)';
          clearTimeout(bounceTimeout);
          bounceTimeout = setTimeout(() => {
            if (coinWrapRef.current) coinWrapRef.current.style.transform = 'scale(1)';
          }, 110);
        }
        prev.coins = levelKit.coinsCollected;
      }
      if (coinTextRef.current && prev.coinLabel !== coinLabel) {
        prev.coinLabel = coinLabel;
        coinTextRef.current.textContent = coinLabel;
      }

      // 3. 6-digit Score
      const scoreStr = String(Math.min(999999, Math.max(0, Math.floor(combat.score)))).padStart(6, '0');
      if (scoreRef.current && prev.scoreStr !== scoreStr) {
        prev.scoreStr = scoreStr;
        scoreRef.current.textContent = scoreStr;
      }

      // 4. 3-digit Time
      const sec = Math.max(0, Math.min(999, Math.floor(eng.timerSeconds ?? 300)));
      const timeStr = String(sec).padStart(3, '0');
      if (timeRef.current && prev.timeStr !== timeStr) {
        prev.timeStr = timeStr;
        timeRef.current.textContent = timeStr;
        timeRef.current.style.color = sec <= 60 ? '#FB7185' : '#F8FAFC';
      }

      // 5. Lives
      const livesStr = `×${combat.lives ?? 3}`;
      if (livesRef.current && prev.livesStr !== livesStr) {
        prev.livesStr = livesStr;
        livesRef.current.textContent = livesStr;
      }

      // 6. Stage 17 Kishōtenketsu Act + Star Medallion inline cluster
      const lvl = eng.levelEngine;
      const lvlActive = Boolean(lvl?.active);
      if (actWrapRef.current && prev.lvlActive !== lvlActive) {
        prev.lvlActive = lvlActive;
        actWrapRef.current.style.display = lvlActive ? 'flex' : 'none';
      }
      if (lvlActive) {
        const actId = lvl.currentActId || 'KI';
        const twistTag = lvl.twistActive ? '!' : '';
        const actSig = `${actId}${twistTag}`;
        if (actBadgeRef.current && prev.actSig !== actSig) {
          prev.actSig = actSig;
          const cfg = ACT_LABELS[actId] || ACT_LABELS.KI;
          actBadgeRef.current.textContent = lvl.twistActive ? `${cfg.label} · TWIST` : cfg.label;
          actBadgeRef.current.style.color = cfg.color;
          actBadgeRef.current.style.borderColor = cfg.border;
        }
        const routeStr = lvl.currentRoute === 'ceiling' ? 'CEIL' : 'FLR';
        if (routeBadgeRef.current && prev.routeStr !== routeStr) {
          prev.routeStr = routeStr;
          routeBadgeRef.current.textContent = routeStr;
          routeBadgeRef.current.style.color = lvl.currentRoute === 'ceiling' ? '#FDE047' : '#94A3B8';
        }
        const starStr = `★ ${lvl.starMedallionsCollected ?? 0}/${lvl.starMedallions?.length ?? 3}`;
        if (starTextRef.current && prev.starStr !== starStr) {
          prev.starStr = starStr;
          starTextRef.current.textContent = starStr;
        }
      }

      // 7. Course Clear badge
      const cleared = Boolean(levelKit.courseCleared);
      if (clearBadgeRef.current && prev.cleared !== cleared) {
        prev.cleared = cleared;
        clearBadgeRef.current.style.display = cleared ? 'inline-block' : 'none';
      }
    };

    sync(activeEngine);
    const unsub = activeEngine.subscribeUITick(sync);
    return () => {
      clearTimeout(bounceTimeout);
      unsub();
    };
  }, [engine, engineRef]);

  return (
    <>
      {/* Stage 17 Kishōtenketsu Top-Left Compact Course Chip (zero bottom-bar overlap!) */}
      <div
        ref={actWrapRef}
        data-testid="hud-kishotenketsu"
        style={{
          ...styles.actChip,
          left: showTelemetry ? 304 : 12,
        }}
      >
        <span ref={actBadgeRef} data-testid="hud-act-badge" style={styles.actBadge}>起 KI</span>
        <span ref={routeBadgeRef} data-testid="hud-route-badge" style={styles.routeBadge}>FLR</span>
        <div style={styles.divider} />
        <span ref={starTextRef} data-testid="hud-star-medallions" style={styles.starVal}>★ 0/3</span>
      </div>

      <aside
        data-testid="wonder-gameplay-hud"
        aria-label="Gameplay HUD"
        className="mwe-gameplay-hud"
        style={styles.hud}
      >
        {/* Circular Power-Up Badge */}
        <div style={styles.formWrap}>
          <div ref={formBadgeRef} data-testid="hud-powerup-badge" style={styles.formCircle}>
            <span ref={formShortRef}>S</span>
          </div>
          <span ref={formLabelRef} data-testid="hud-powerup-label" style={styles.formText}>
            SMALL
          </span>
        </div>

        <div style={styles.divider} />

        {/* Coins */}
        <div ref={coinWrapRef} data-testid="coin-counter-hud" style={styles.coinBlock}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <ellipse cx="8" cy="8" rx="6" ry="7" fill="#FACC15" stroke="#B45309" strokeWidth="1.5" />
            <rect x="6.7" y="4.5" width="2.6" height="7" rx="1" fill="#FEF9C3" />
          </svg>
          <span ref={coinTextRef} data-testid="coin-count" style={styles.coinValue}>00</span>
        </div>

        <div style={styles.divider} />

        {/* 6-digit Score */}
        <div style={styles.statBlock}>
          <span style={styles.kicker}>SCORE</span>
          <span ref={scoreRef} data-testid="hud-score" style={styles.scoreVal}>000000</span>
        </div>

        <div style={styles.divider} />

        {/* 3-digit Time */}
        <div style={styles.statBlock}>
          <span style={styles.kicker}>TIME</span>
          <span ref={timeRef} data-testid="hud-time" style={styles.timeVal}>300</span>
        </div>

        {/* Lives */}
        <div style={styles.livesPill} data-testid="hud-lives">
          <span style={{ color: '#FB7185' }}>♥</span>
          <span ref={livesRef} style={styles.livesVal}>×3</span>
        </div>

        {/* Course Clear! Badge */}
        <span ref={clearBadgeRef} data-testid="course-clear-badge" style={styles.clearBadge}>
          CLEAR!
        </span>
      </aside>
    </>
  );
}

const styles = {
  hud: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 11px',
    borderRadius: 10,
    background: 'rgba(10, 14, 34, 0.90)',
    border: '1px solid rgba(250, 204, 21, 0.36)',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.48)',
    fontFamily: '"JetBrains Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 560,
  },
  formWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  formCircle: {
    width: 22,
    height: 22,
    borderRadius: 99,
    border: '2px solid #64748B',
    background: 'rgba(30, 41, 59, 0.95)',
    color: '#CBD5E1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 900,
    lineHeight: 1,
  },
  formText: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.8,
    color: '#CBD5E1',
  },
  divider: {
    width: 1,
    height: 18,
    background: 'rgba(148, 163, 184, 0.25)',
  },
  coinBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'transform 90ms ease-out',
  },
  coinValue: {
    color: '#FEF08A',
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: 0.6,
  },
  statBlock: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.05,
  },
  kicker: {
    fontSize: 8,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: 0.8,
  },
  scoreVal: {
    fontSize: 12,
    fontWeight: 800,
    color: '#F8FAFC',
    letterSpacing: 0.6,
  },
  timeVal: {
    fontSize: 12,
    fontWeight: 800,
    color: '#F8FAFC',
    letterSpacing: 0.6,
  },
  livesPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 6px',
    borderRadius: 6,
    background: 'rgba(30, 41, 59, 0.85)',
    border: '1px solid rgba(251, 113, 133, 0.35)',
    fontSize: 11,
    fontWeight: 800,
  },
  livesVal: {
    color: '#F8FAFC',
  },
  actChip: {
    position: 'absolute',
    top: 10,
    left: 12,
    display: 'none',
    alignItems: 'center',
    gap: 7,
    padding: '5px 10px',
    borderRadius: 10,
    background: 'rgba(10, 14, 34, 0.90)',
    border: '1px solid rgba(56, 189, 248, 0.38)',
    boxShadow: '0 6px 18px rgba(0, 0, 0, 0.45)',
    fontFamily: '"JetBrains Mono", monospace',
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 560,
  },
  actBadge: {
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 0.7,
    color: '#4ADE80',
    background: 'rgba(15, 23, 42, 0.90)',
    border: '1px solid rgba(74, 222, 128, 0.50)',
    borderRadius: 5,
    padding: '2px 6px',
  },
  routeBadge: {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 0.6,
    color: '#94A3B8',
  },
  starVal: {
    fontSize: 11.5,
    fontWeight: 900,
    color: '#FDE047',
    letterSpacing: 0.5,
  },
  clearBadge: {
    display: 'none',
    fontSize: 10,
    fontWeight: 800,
    color: '#4ADE80',
    background: 'rgba(22, 163, 74, 0.28)',
    border: '1px solid #4ADE80',
    borderRadius: 5,
    padding: '2px 6px',
    letterSpacing: 0.9,
  },
};

export default WonderGameplayHUD;
