/**
 * LifeMeter — Spec §4.2
 * =====================
 * Wedge-based radial vitality gauge:
 *   - 3 base wedges (Red/White)
 *   - Optional +3 expandable Life-Up wedges in distinct Green ring
 *   - Damage shake & single pulse when hit
 *   - One-hit low-health flash + audio hook
 *   - Explicit centre numeral for non-colour-only legibility
 */

import React, { useEffect, useRef, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';

export function computeLifeMeterState(hp = 3, maxHp = 3, bonusHp = 0) {
  const safeMax = Math.max(1, Math.floor(maxHp));
  const safeBase = Math.max(0, Math.min(safeMax, Math.floor(hp)));
  const safeBonus = Math.max(0, Math.min(TOKENS.rules.bonusHealthWedges, Math.floor(bonusHp)));
  const total = safeBase + safeBonus;
  const maxTotal = safeMax + TOKENS.rules.bonusHealthWedges;
  return {
    baseHp: safeBase,
    maxBaseHp: safeMax,
    bonusHp: safeBonus,
    total,
    isExpanded: safeBonus > 0,
    isLow: total === 1,
    isEmpty: total === 0,
    isMaximum: total >= maxTotal,
  };
}

function buildWedgeArc(cx, cy, r, startDeg, endDeg) {
  const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function LifeMeter({
  hp = 3,
  maxHp = 3,
  bonusHp = 0,
  compact = false,
  forcedState = null,
  testId = 'ui-v2-life-meter',
}) {
  const info = computeLifeMeterState(hp, maxHp, bonusHp);
  const [shaking, setShaking] = useState(false);
  const prevTotalRef = useRef(info.total);
  const shakeTimerRef = useRef(null);

  useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = info.total;
    if (info.total < prev) {
      uiAudio.play(info.isLow ? UISoundHook.LOW_HEALTH_PULSE : UISoundHook.DAMAGE);
      setShaking(true);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setShaking(false), TOKENS.motion.damageShake);
    } else if (info.total > prev && info.isExpanded) {
      uiAudio.play(UISoundHook.LIFE_UP);
    }
    return () => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, [info.total, info.isLow, info.isExpanded]);

  const derivedState =
    forcedState ||
    (shaking
      ? 'updating'
      : info.isEmpty
        ? 'empty'
        : info.isMaximum
          ? 'maximum'
          : info.isLow
            ? 'low'
            : 'default');

  const classes = [
    'ui-v2-life-meter',
    compact ? 'is-compact' : '',
    derivedState !== 'default' ? `is-${derivedState}` : '',
    info.isLow && derivedState !== 'disabled' ? 'is-low' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const baseWedges = [
    { idx: 0, d: buildWedgeArc(32, 32, 22, 8, 112) },
    { idx: 1, d: buildWedgeArc(32, 32, 22, 128, 232) },
    { idx: 2, d: buildWedgeArc(32, 32, 22, 248, 352) },
  ];

  const bonusWedges = [
    { idx: 0, d: buildWedgeArc(32, 32, 28, 8, 112) },
    { idx: 1, d: buildWedgeArc(32, 32, 28, 128, 232) },
    { idx: 2, d: buildWedgeArc(32, 32, 28, 248, 352) },
  ];

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-hp={info.total}
      role="meter"
      aria-label={`Vitality ${info.total} of ${info.maxBaseHp}${info.isExpanded ? ` plus ${info.bonusHp} bonus` : ''}`}
      aria-valuenow={info.total}
      aria-valuemin={0}
      aria-valuemax={info.maxBaseHp + TOKENS.rules.bonusHealthWedges}
    >
      <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
        {baseWedges.map((w) => {
          const filled = w.idx < info.baseHp;
          return (
            <path
              key={`base-${w.idx}`}
              d={w.d}
              fill="none"
              stroke={filled ? (info.isLow ? 'var(--ui-color-red)' : 'var(--ui-color-red)') : 'var(--ui-color-surface-deep)'}
              strokeWidth="7"
              strokeLinecap="round"
            />
          );
        })}
        {info.isExpanded &&
          bonusWedges.map((w) => {
            const filled = w.idx < info.bonusHp;
            return (
              <path
                key={`bonus-${w.idx}`}
                d={w.d}
                fill="none"
                stroke={filled ? 'var(--ui-color-green)' : 'var(--ui-color-surface-ghost)'}
                strokeWidth="4.5"
                strokeLinecap="round"
              />
            );
          })}
      </svg>
      <div className="ui-v2-life-meter-center">
        <span className="ui-v2-display-num-sm">{info.total}</span>
      </div>
    </div>
  );
}

export default LifeMeter;
