/**
 * CounterChip — Spec §4.1
 * =======================
 * Fixed-width tabular display numeral + semantic icon with roll animation,
 * scale pop settle, max clamp, sound hook, and all 7 UI states.
 */

import React, { useEffect, useRef, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { GoldShardIcon, PrismPetalIcon } from './Icons.jsx';

export function computeCounterDisplay(value = 0, maxValue = TOKENS.rules.maxSpecialCurrency, padDigits = 2) {
  const safeMax = Math.max(1, Math.floor(maxValue));
  const raw = Number.isFinite(value) ? Math.floor(value) : 0;
  const clamped = Math.max(0, Math.min(safeMax, raw));
  const text = String(clamped).padStart(padDigits, '0');
  return {
    clamped,
    text,
    isEmpty: clamped === 0,
    isMax: clamped >= safeMax,
  };
}

export function CounterChip({
  value = 0,
  maxValue = TOKENS.rules.maxSpecialCurrency,
  padDigits = 2,
  variant = 'gold',
  label = 'Gold Shards',
  icon = null,
  forcedState = null,
  soundHook = null,
  testId = 'ui-v2-counter-chip',
}) {
  const target = computeCounterDisplay(value, maxValue, padDigits);
  const [shownVal, setShownVal] = useState(target.clamped);
  const [isPopping, setIsPopping] = useState(false);
  const prevTargetRef = useRef(target.clamped);
  const animRafRef = useRef(null);
  const popTimerRef = useRef(null);

  useEffect(() => {
    const prev = prevTargetRef.current;
    const next = target.clamped;
    if (prev === next) return;
    prevTargetRef.current = next;

    const hook = soundHook || (variant === 'purple' ? UISoundHook.SPECIAL_COIN_CHIME : UISoundHook.COIN_TICK);
    uiAudio.play(hook);

    setIsPopping(true);
    if (popTimerRef.current) clearTimeout(popTimerRef.current);
    popTimerRef.current = setTimeout(() => setIsPopping(false), TOKENS.motion.pop);

    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = TOKENS.motion.tick;

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / Math.max(1, duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setShownVal(Math.round(prev + (next - prev) * eased));
      if (t < 1 && typeof requestAnimationFrame !== 'undefined') {
        animRafRef.current = requestAnimationFrame(tick);
      } else {
        setShownVal(next);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      if (animRafRef.current) cancelAnimationFrame(animRafRef.current);
      animRafRef.current = requestAnimationFrame(tick);
    } else {
      setShownVal(next);
    }

    return () => {
      if (animRafRef.current && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(animRafRef.current);
      }
      if (popTimerRef.current) clearTimeout(popTimerRef.current);
    };
  }, [target.clamped, soundHook, variant]);

  const displayed = computeCounterDisplay(shownVal, maxValue, padDigits);
  const derivedState =
    forcedState ||
    (isPopping ? 'updating' : displayed.isMax ? 'maximum' : displayed.isEmpty ? 'empty' : 'default');

  const classes = [
    'ui-v2-counter-chip',
    `is-${variant}`,
    padDigits >= 3 ? 'is-wide' : '',
    derivedState !== 'default' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const resolvedIcon =
    icon || (variant === 'purple' ? <PrismPetalIcon /> : <GoldShardIcon />);

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-value={displayed.clamped}
      aria-label={`${label}: ${displayed.clamped}`}
    >
      <span className="ui-v2-counter-icon">{resolvedIcon}</span>
      <span
        className={`ui-v2-display-num ui-v2-counter-digits${padDigits >= 3 ? ' is-three' : ''}`}
      >
        {displayed.text}
      </span>
      {derivedState === 'maximum' && (
        <span className="ui-v2-max-tag" aria-label="Maximum reached">
          MAX
        </span>
      )}
    </div>
  );
}

export default CounterChip;
